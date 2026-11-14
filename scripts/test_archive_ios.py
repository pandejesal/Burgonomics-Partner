import base64
import contextlib
import io
import os
import pathlib
import plistlib
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock

import archive_ios
from archive_ios import SIGNING_KEYS, signing_mode

TEAM = 'TEAM123456'
BUNDLE = 'com.burgonomics.partner'
PROFILE_UUID = '11111111-2222-3333-4444-555555555555'
INSTALLED_NAME = 'review-' + PROFILE_UUID + '.mobileprovision'
KEYCHAIN_NAME = 'signing.keychain-db'
OPT_IN = 'IOS_DISTRIBUTION_OPT_IN'
ALL_KEYS = dict.fromkeys(SIGNING_KEYS, 'present')


def profile_plist(bundle=BUNDLE, team=TEAM, push='production', uuid=PROFILE_UUID):
    return plistlib.dumps({
        'UUID': uuid,
        'Name': 'Distribution',
        'Entitlements': {
            'application-identifier': team + '.' + bundle,
            'aps-environment': push,
        },
    })


def is_search_list_mutation(args):
    return (args[:2] == ('security', 'list-keychains') and '-s' in args
            and any(str(argument).endswith(KEYCHAIN_NAME) for argument in args))


def is_search_list_restore(args):
    return (args[:2] == ('security', 'list-keychains') and '-s' in args
            and not any(str(argument).endswith(KEYCHAIN_NAME) for argument in args))


class SigningModeTest(unittest.TestCase):
    def test_no_secrets_is_unsigned(self): self.assertEqual(signing_mode({}), 'unsigned')

    def test_partial_secrets_fail(self):
        with self.assertRaisesRegex(ValueError, 'Incomplete iOS signing secrets'):
            signing_mode({'ASC_KEY_ID': 'present', OPT_IN: 'true'})

    def test_all_secrets_with_explicit_opt_in_allow_signing(self):
        self.assertEqual(signing_mode(dict(ALL_KEYS, **{OPT_IN: 'true'})), 'signed')

    # REGRESSION (was test_all_secrets_allow_signing): presence of material is
    # not consent. Without the exact opt-in the script fails closed.
    def test_all_secrets_without_opt_in_fail_closed(self):
        with self.assertRaisesRegex(ValueError, 'IOS_DISTRIBUTION_OPT_IN'):
            signing_mode(dict(ALL_KEYS))

    def test_single_signing_material_without_opt_in_fails_closed(self):
        with self.assertRaisesRegex(ValueError, 'IOS_DISTRIBUTION_OPT_IN'):
            signing_mode({'ASC_KEY_ID': 'present'})

    def test_opt_in_without_material_fails_closed(self):
        with self.assertRaisesRegex(ValueError, 'Incomplete iOS signing secrets'):
            signing_mode({OPT_IN: 'true'})

    def test_only_exact_true_grants_consent(self):
        for value in ('TRUE', 'True', 'yes', '1', 'true ', '', 'false', None):
            with self.subTest(value=value):
                with self.assertRaisesRegex(ValueError, 'IOS_DISTRIBUTION_OPT_IN'):
                    signing_mode(dict(ALL_KEYS, **{OPT_IN: value}))
                self.assertEqual(signing_mode({OPT_IN: value}), 'unsigned')

    def test_simulator_only_rejects_distribution_even_when_configured(self):
        with self.assertRaisesRegex(ValueError, 'CI_SIMULATOR_ONLY'):
            signing_mode(dict(ALL_KEYS, **{OPT_IN: 'true', 'CI_SIMULATOR_ONLY': 'true'}))

    def test_simulator_only_still_allows_unsigned_archive(self):
        self.assertEqual(signing_mode({'CI_SIMULATOR_ONLY': 'true'}), 'unsigned')


class FakeRunner:
    """Hermetic stand-in for the subprocess module used by archive_ios."""

    def __init__(self, profile_bytes=None, previous=''):
        self.profile_bytes = profile_plist() if profile_bytes is None else profile_bytes
        self.previous = previous
        self.calls = []
        self.rules = []
        self.DEVNULL = subprocess.DEVNULL
        self.CalledProcessError = subprocess.CalledProcessError
        self.CompletedProcess = subprocess.CompletedProcess

    @staticmethod
    def key(args):
        if len(args) > 1:
            return args[0] + ':' + args[1]
        return args[0]

    def fail_on(self, matcher, error, times=None):
        self.rules.append([matcher, error, times])

    def _failure(self, args):
        for rule in self.rules:
            matcher, error, times = rule
            matched = matcher(args) if callable(matcher) else self.key(args) == matcher
            if not matched:
                continue
            if times is not None:
                if times <= 0:
                    continue
                rule[2] = times - 1
            return error
        return None

    def check_output(self, args, **kwargs):
        self.calls.append(tuple(args))
        failure = self._failure(args)
        if failure is not None:
            raise failure
        if args[1] == 'cms':
            return self.profile_bytes
        return self.previous

    def run(self, args, check=True, **kwargs):
        self.calls.append(tuple(args))
        failure = self._failure(args)
        if isinstance(failure, int):
            return self.CompletedProcess(args, failure)
        if failure is not None:
            raise failure
        # `security create-keychain` produces the artifact our cleanup must own.
        if args[:2] == ('security', 'create-keychain'):
            pathlib.Path(args[-1]).write_bytes(b'keychain')
        return self.CompletedProcess(args, 0)


class ArchiveIosHarness(unittest.TestCase):
    def setUp(self):
        self.root = pathlib.Path(tempfile.mkdtemp(prefix='archive-ios-test-'))
        self.addCleanup(shutil.rmtree, str(self.root), True)
        self.home = self.root / 'home'
        self.profiles = self.home / 'Library' / 'MobileDevice' / 'Provisioning Profiles'
        self.installed = self.profiles / INSTALLED_NAME
        self.runner_temp = self.root / 'runner'
        self.runner_temp.mkdir()
        self.output = self.root / 'github-output'
        patcher = mock.patch.object(pathlib.Path, 'home', staticmethod(lambda: self.home))
        patcher.start()
        self.addCleanup(patcher.stop)

    def base_env(self, secrets):
        env = {key: '' for key in SIGNING_KEYS}
        env.update(secrets)
        env['RUNNER_TEMP'] = str(self.runner_temp)
        env['GITHUB_OUTPUT'] = str(self.output)
        return env

    def signed_env(self, profile_bytes=None, **overrides):
        profile_bytes = profile_plist() if profile_bytes is None else profile_bytes
        secrets = {
            'ASC_API_KEY_BASE64': base64.b64encode(b'p8-key').decode(),
            'ASC_KEY_ID': 'ABCDE12345',
            'ASC_ISSUER_ID': '11111111-2222-3333-4444-555555555555',
            'APPLE_TEAM_ID': TEAM,
            'IOS_CERTIFICATE_BASE64': base64.b64encode(b'p12-cert').decode(),
            'IOS_CERTIFICATE_PASSWORD': 'cert-secret',
            'IOS_PROFILE_BASE64': base64.b64encode(profile_bytes).decode(),
        }
        secrets.update(overrides)
        env = self.base_env(secrets)
        # Explicit consent is required for every signed-path test.
        env[OPT_IN] = 'true'
        return env

    def run_main(self, fake, env):
        with mock.patch.dict(os.environ, env), mock.patch.object(archive_ios, 'subprocess', fake):
            return archive_ios.main()

    def calls(self, fake, key):
        return [call for call in fake.calls if FakeRunner.key(call) == key]

    def restores(self, fake):
        return [call for call in fake.calls if is_search_list_restore(call)]

    def profile_dir_is_empty(self):
        return not self.profiles.exists() or not any(self.profiles.iterdir())


class UnsignedArchiveTest(ArchiveIosHarness):
    def test_unsigned_archive_skips_signing_and_reports_false(self):
        fake = FakeRunner()
        self.run_main(fake, self.base_env({}))
        self.assertEqual(len(fake.calls), 1)
        arguments = fake.calls[0]
        self.assertEqual(arguments[:3], ('xcodebuild', '-project', 'ios/App/App.xcodeproj'))
        self.assertEqual(arguments[-2:], ('CODE_SIGNING_ALLOWED=NO', 'archive'))
        self.assertEqual(self.output.read_text(encoding='utf-8'), 'signed=false\n')

    def test_unsigned_archive_never_touches_security(self):
        fake = FakeRunner()
        self.run_main(fake, self.base_env({}))
        self.assertEqual([call for call in fake.calls if call[0] == 'security'], [])


class SignedArchiveTest(ArchiveIosHarness):
    def test_signed_archive_installs_and_removes_owned_profile(self):
        profile_bytes = profile_plist()
        fake = FakeRunner(profile_bytes=profile_bytes)
        written = []
        real_write = os.write

        def recording_write(descriptor, data):
            written.append(data)
            return real_write(descriptor, data)

        with mock.patch.object(archive_ios.os, 'write', recording_write):
            self.run_main(fake, self.signed_env(profile_bytes))

        self.assertEqual(written, [profile_bytes])
        self.assertTrue(self.profile_dir_is_empty())
        self.assertEqual(self.output.read_text(encoding='utf-8'), 'signed=true\n')

        build = self.calls(fake, 'xcodebuild:-project')
        self.assertEqual(len(build), 1)
        self.assertIn('DEVELOPMENT_TEAM=' + TEAM, build[0])
        self.assertIn('CODE_SIGN_STYLE=Manual', build[0])
        self.assertIn('PROVISIONING_PROFILE_SPECIFIER=' + PROFILE_UUID, build[0])
        self.assertIn('-archivePath', build[0])

        export = self.calls(fake, 'xcodebuild:-exportArchive')
        self.assertEqual(len(export), 1)
        self.assertIn('-archivePath', export[0])
        self.assertIn('-exportOptionsPlist', export[0])

        self.assertEqual(len(self.calls(fake, 'security:delete-keychain')), 1)
        self.assertEqual(len(self.restores(fake)), 1)

    def test_signed_export_options_keep_partner_identity_and_export_only(self):
        fake = FakeRunner()
        env = self.signed_env()
        dumped = []
        real_dumps = plistlib.dumps

        def recording_dumps(value, **kwargs):
            dumped.append(value)
            return real_dumps(value, **kwargs)

        with mock.patch.object(archive_ios.plistlib, 'dumps', recording_dumps):
            self.run_main(fake, env)

        self.assertEqual(len(dumped), 1)
        options = dumped[0]
        self.assertEqual(options['method'], 'app-store-connect')
        self.assertEqual(options['destination'], 'export')
        self.assertEqual(options['teamID'], TEAM)
        self.assertEqual(options['signingStyle'], 'manual')
        self.assertEqual(options['provisioningProfiles'], {BUNDLE: PROFILE_UUID})

    def test_signed_archive_has_no_upload_commands(self):
        fake = FakeRunner()
        self.run_main(fake, self.signed_env())
        forbidden = ('altool', 'notarytool', 'upload', 'transporter', 'testflight')
        for call in fake.calls:
            self.assertIn(call[0], ('xcodebuild', 'security'), call[0])
            lowered = ' '.join(call).lower()
            for word in forbidden:
                self.assertNotIn(word, lowered)

    def test_signed_restores_exact_previous_search_list(self):
        previous = '"/Users/a b/Library/Keychains/login.keychain-db"\n    "System.keychain"\n'
        fake = FakeRunner(previous=previous)
        self.run_main(fake, self.signed_env())
        expected = ('security', 'list-keychains', '-d', 'user', '-s',
                    '/Users/a b/Library/Keychains/login.keychain-db', 'System.keychain')
        self.assertEqual(self.restores(fake), [expected])
        mutations = [call for call in fake.calls if is_search_list_mutation(call)]
        self.assertEqual(len(mutations), 1)
        self.assertEqual(mutations[0][-2:], expected[-2:])

    def test_empty_previous_search_list_restores_exact_argv(self):
        fake = FakeRunner(previous='')
        self.run_main(fake, self.signed_env())
        self.assertEqual(self.restores(fake), [('security', 'list-keychains', '-d', 'user', '-s')])


class OriginalErrorTest(ArchiveIosHarness):
    def test_archive_failure_object_survives_failing_restore(self):
        build_error = subprocess.CalledProcessError(65, ['xcodebuild'])
        fake = FakeRunner()
        fake.fail_on('xcodebuild:-project', build_error)
        fake.fail_on(is_search_list_restore, OSError('restore failed'))
        with self.assertRaises(subprocess.CalledProcessError) as caught:
            self.run_main(fake, self.signed_env())
        self.assertIs(caught.exception, build_error)
        self.assertTrue(self.profile_dir_is_empty())
        self.assertEqual(len(self.calls(fake, 'security:delete-keychain')), 1)
        self.assertEqual(len(self.restores(fake)), 1)

    def test_partial_search_list_mutation_preserves_original_error(self):
        mutation_error = OSError('search list update failed')
        previous = '"/Users/a b/Library/Keychains/login.keychain-db"\n    "System.keychain"\n'
        fake = FakeRunner(previous=previous)
        fake.fail_on(is_search_list_mutation, mutation_error, times=1)
        with self.assertRaises(OSError) as caught:
            self.run_main(fake, self.signed_env())
        self.assertIs(caught.exception, mutation_error)
        self.assertEqual(self.restores(fake),
                         [('security', 'list-keychains', '-d', 'user', '-s',
                           '/Users/a b/Library/Keychains/login.keychain-db', 'System.keychain')])
        self.assertEqual(len(self.calls(fake, 'security:delete-keychain')), 1)
        self.assertTrue(self.profile_dir_is_empty())

    def test_partial_profile_write_preserves_original_and_removes_file(self):
        write_error = OSError('disk full')
        fake = FakeRunner()
        with mock.patch.object(archive_ios.os, 'write', mock.Mock(side_effect=write_error)):
            with self.assertRaises(OSError) as caught:
                self.run_main(fake, self.signed_env())
        self.assertIs(caught.exception, write_error)
        self.assertTrue(self.profile_dir_is_empty())

    def test_close_failure_does_not_mask_write_failure(self):
        write_error = OSError('disk full')
        close_error = OSError('close failed')
        real_close = os.close

        def failing_close(descriptor):
            real_close(descriptor)
            raise close_error

        fake = FakeRunner()
        with mock.patch.object(archive_ios.os, 'write', mock.Mock(side_effect=write_error)), \
                mock.patch.object(archive_ios.os, 'close', failing_close):
            with self.assertRaises(OSError) as caught:
                self.run_main(fake, self.signed_env())
        self.assertIs(caught.exception, write_error)
        self.assertTrue(self.profile_dir_is_empty())

    def test_close_failure_after_successful_write_fails_closed(self):
        close_error = OSError('close failed')
        real_close = os.close

        def failing_close(descriptor):
            real_close(descriptor)
            raise close_error

        with mock.patch.object(archive_ios.os, 'close', failing_close):
            with self.assertRaises(OSError) as caught:
                self.run_main(FakeRunner(), self.signed_env())
        self.assertIs(caught.exception, close_error)
        self.assertTrue(self.profile_dir_is_empty())

    def test_bundle_mismatch_fails_before_any_keychain_work(self):
        mismatched = profile_plist(bundle='com.burgonomics.other')
        fake = FakeRunner(profile_bytes=mismatched)
        with self.assertRaisesRegex(ValueError, 'bundle/team or production push entitlement mismatch'):
            self.run_main(fake, self.signed_env(mismatched))
        self.assertEqual(self.calls(fake, 'security:create-keychain'), [])
        self.assertEqual(self.calls(fake, 'security:delete-keychain'), [])
        self.assertTrue(self.profile_dir_is_empty())


class CleanupFailureTest(ArchiveIosHarness):
    def test_primary_error_survives_all_cleanup_failures(self):
        export_error = subprocess.CalledProcessError(1, ['xcodebuild', '-exportArchive'])
        fake = FakeRunner()
        fake.fail_on('xcodebuild:-exportArchive', export_error)
        fake.fail_on(is_search_list_restore, OSError('restore failed'))
        fake.fail_on('security:delete-keychain', 2)
        real_unlink = pathlib.Path.unlink

        def failing_unlink(path, missing_ok=False):
            if pathlib.Path(path) == self.installed:
                raise OSError('unlink failed')
            return real_unlink(path, missing_ok=missing_ok)

        with mock.patch.object(pathlib.Path, 'unlink', failing_unlink):
            with self.assertRaises(subprocess.CalledProcessError) as caught:
                self.run_main(fake, self.signed_env())
        self.assertIs(caught.exception, export_error)
        self.assertEqual(caught.exception.cleanup_failures,
                         ('restore-keychain-search-list', 'delete-keychain',
                          'remove-installed-profile'))

    def test_cleanup_only_failure_fails_closed(self):
        fake = FakeRunner()
        fake.fail_on(is_search_list_restore, OSError('restore failed'))
        with self.assertRaises(archive_ios.CleanupError) as caught:
            self.run_main(fake, self.signed_env())
        self.assertEqual(caught.exception.failures, ('restore-keychain-search-list',))
        self.assertEqual(len(self.calls(fake, 'security:delete-keychain')), 1)
        self.assertTrue(self.profile_dir_is_empty())
        self.assertFalse(self.output.exists())

    def test_delete_keychain_nonzero_fails_closed(self):
        fake = FakeRunner()
        fake.fail_on('security:delete-keychain', 1)
        with self.assertRaises(archive_ios.CleanupError) as caught:
            self.run_main(fake, self.signed_env())
        self.assertEqual(caught.exception.failures, ('delete-keychain',))
        self.assertTrue(self.profile_dir_is_empty())

    def test_delete_keychain_oserror_fails_closed(self):
        fake = FakeRunner()
        fake.fail_on('security:delete-keychain', OSError('security missing'))
        with self.assertRaises(archive_ios.CleanupError) as caught:
            self.run_main(fake, self.signed_env())
        self.assertEqual(caught.exception.failures, ('delete-keychain',))
        self.assertTrue(self.profile_dir_is_empty())

    def test_profile_unlink_failure_fails_closed_and_still_deletes_keychain(self):
        fake = FakeRunner()
        real_unlink = pathlib.Path.unlink
        raised = []

        def flaky_unlink(path, missing_ok=False):
            if pathlib.Path(path) == self.installed and not raised:
                raised.append(path)
                raise OSError('unlink blocked')
            return real_unlink(path, missing_ok=missing_ok)

        with mock.patch.object(pathlib.Path, 'unlink', flaky_unlink):
            with self.assertRaises(archive_ios.CleanupError) as caught:
                self.run_main(fake, self.signed_env())
        self.assertEqual(caught.exception.failures, ('remove-installed-profile',))
        self.assertEqual(len(self.calls(fake, 'security:delete-keychain')), 1)

    def test_every_owned_cleanup_is_attempted_when_all_fail(self):
        fake = FakeRunner()
        fake.fail_on(is_search_list_restore, OSError('restore failed'))
        fake.fail_on('security:delete-keychain', OSError('delete failed'))
        real_unlink = pathlib.Path.unlink
        unlinked = []

        def failing_unlink(path, missing_ok=False):
            text = str(path)
            if (text.endswith(KEYCHAIN_NAME) or text == str(self.installed)) and text not in unlinked:
                unlinked.append(text)
                raise OSError('unlink failed')
            return real_unlink(path, missing_ok=missing_ok)

        with mock.patch.object(pathlib.Path, 'unlink', failing_unlink):
            with self.assertRaises(archive_ios.CleanupError) as caught:
                self.run_main(fake, self.signed_env())
        self.assertEqual(caught.exception.failures, (
            'restore-keychain-search-list',
            'delete-keychain',
            'remove-keychain-file',
            'remove-installed-profile',
        ))

    def test_cleanup_order_restores_list_before_deleting_keychain(self):
        fake = FakeRunner()
        self.run_main(fake, self.signed_env())
        restore_index = next(index for index, call in enumerate(fake.calls)
                             if is_search_list_restore(call))
        delete_index = [FakeRunner.key(call) for call in fake.calls].index('security:delete-keychain')
        self.assertLess(restore_index, delete_index)
        self.assertTrue(self.profile_dir_is_empty())

    def test_cleanup_notes_are_sanitized_and_keep_original_error(self):
        build_error = OSError('build failed at /secret/path')
        fake = FakeRunner()
        fake.fail_on('xcodebuild:-project', build_error)
        fake.fail_on(is_search_list_restore, OSError('restore failed'))
        stderr = io.StringIO()
        with mock.patch.object(archive_ios.secrets, 'token_urlsafe', lambda size: 'PASSWORD-SENTINEL'):
            with contextlib.redirect_stderr(stderr):
                with self.assertRaises(OSError) as caught:
                    self.run_main(fake, self.signed_env())
        self.assertIs(caught.exception, build_error)
        notes = stderr.getvalue()
        self.assertIn('restore-keychain-search-list', notes)
        self.assertIn('OSError', notes)
        for leak in ('PASSWORD-SENTINEL', 'cert-secret', '/secret/path', '-project'):
            self.assertNotIn(leak, notes)


class OwnershipTest(ArchiveIosHarness):
    def test_existing_profile_is_neither_overwritten_nor_deleted(self):
        self.profiles.mkdir(parents=True)
        self.installed.write_bytes(b'existing-profile')
        fake = FakeRunner()
        with self.assertRaisesRegex(ValueError, 'Refusing to overwrite existing provisioning profile'):
            self.run_main(fake, self.signed_env())
        self.assertEqual(self.installed.read_bytes(), b'existing-profile')
        self.assertEqual(self.calls(fake, 'security:create-keychain'), [])
        self.assertEqual(self.calls(fake, 'security:delete-keychain'), [])

    def test_concurrently_installed_profile_is_never_deleted(self):
        fake = FakeRunner()
        real_open = os.open

        def racing_open(path, flags, mode=0o777):
            if pathlib.Path(path) == self.installed:
                self.installed.parent.mkdir(parents=True, exist_ok=True)
                self.installed.write_bytes(b'concurrent-profile')
                raise FileExistsError(17, 'File exists')
            return real_open(path, flags, mode)

        with mock.patch.object(archive_ios.os, 'open', racing_open):
            with self.assertRaisesRegex(ValueError, 'Refusing to overwrite existing provisioning profile'):
                self.run_main(fake, self.signed_env())
        self.assertEqual(self.installed.read_bytes(), b'concurrent-profile')
        self.assertEqual(self.calls(fake, 'security:delete-keychain'), [])

    def test_profile_install_uses_exclusive_creation_flag(self):
        flags = []
        real_open = os.open

        def recording_open(path, flag, mode=0o777):
            flags.append(flag)
            return real_open(path, flag, mode)

        with mock.patch.object(archive_ios.os, 'open', recording_open):
            self.run_main(FakeRunner(), self.signed_env())
        self.assertTrue(any(flag & os.O_EXCL for flag in flags))
        self.assertTrue(any(flag & os.O_CREAT for flag in flags))

    def test_partially_created_keychain_is_deleted_and_file_removed(self):
        create_error = OSError('create-keychain failed')
        fake = FakeRunner()
        unlinked = []
        real_unlink = pathlib.Path.unlink

        def partial_create(args):
            if args[:2] == ('security', 'create-keychain'):
                pathlib.Path(args[-1]).write_bytes(b'partial-keychain')
                return True
            return False

        def recording_unlink(path, missing_ok=False):
            unlinked.append(str(path))
            return real_unlink(path, missing_ok=missing_ok)

        fake.fail_on(partial_create, create_error, times=1)
        with mock.patch.object(pathlib.Path, 'unlink', recording_unlink):
            with self.assertRaises(OSError) as caught:
                self.run_main(fake, self.signed_env())
        self.assertIs(caught.exception, create_error)
        self.assertEqual(len(self.calls(fake, 'security:delete-keychain')), 1)
        self.assertTrue(any(path.endswith(KEYCHAIN_NAME) for path in unlinked))


class CleanupCancelled(BaseException):
    """Stand-in for cancellation (KeyboardInterrupt/SystemExit) during cleanup."""


class SecondaryFailureIsolationTest(ArchiveIosHarness):
    """A failing diagnostic sink or temp-dir teardown must not win over the real error."""

    class BrokenSink:
        def write(self, text):
            raise OSError('synthetic diagnostic sink unavailable')

        def flush(self):
            raise OSError('synthetic diagnostic sink unavailable')

    def test_broken_diagnostic_sink_does_not_stop_cleanup_or_mask_primary(self):
        primary = subprocess.CalledProcessError(65, ['xcodebuild'])
        fake = FakeRunner()
        fake.fail_on('xcodebuild:-project', primary)
        fake.fail_on(is_search_list_restore, OSError('synthetic restore failure'))
        with mock.patch.object(archive_ios.sys, 'stderr', self.BrokenSink()):
            with self.assertRaises(subprocess.CalledProcessError) as caught:
                self.run_main(fake, self.signed_env())
        self.assertIs(caught.exception, primary)
        self.assertEqual(len(self.calls(fake, 'security:delete-keychain')), 1)
        self.assertTrue(self.profile_dir_is_empty())

    def test_tempdir_teardown_failure_does_not_replace_primary(self):
        primary = subprocess.CalledProcessError(65, ['xcodebuild'])
        fake = FakeRunner()
        fake.fail_on('xcodebuild:-project', primary)
        with mock.patch.object(archive_ios.tempfile.TemporaryDirectory, 'cleanup',
                               side_effect=OSError('synthetic teardown failure')):
            with self.assertRaises(subprocess.CalledProcessError) as caught:
                self.run_main(fake, self.signed_env())
        self.assertIs(caught.exception, primary)

    def test_tempdir_teardown_failure_alone_fails_closed_with_stable_label(self):
        fake = FakeRunner()
        with mock.patch.object(archive_ios.tempfile.TemporaryDirectory, 'cleanup',
                               side_effect=OSError('synthetic teardown failure')):
            with self.assertRaises(archive_ios.CleanupError) as caught:
                self.run_main(fake, self.signed_env())
        self.assertEqual(caught.exception.failures, ('remove-signing-tempdir',))
        self.assertEqual(len(self.calls(fake, 'security:delete-keychain')), 1)
        self.assertTrue(self.profile_dir_is_empty())
        self.assertFalse(self.output.exists())

    def test_early_setup_failure_still_isolates_teardown_failure(self):
        env = self.signed_env()
        env['IOS_CERTIFICATE_BASE64'] = 'not-valid-base64!!'
        fake = FakeRunner()
        with mock.patch.object(archive_ios.tempfile.TemporaryDirectory, 'cleanup',
                               side_effect=OSError('synthetic teardown failure')):
            with self.assertRaises(ValueError) as caught:
                self.run_main(fake, env)
        self.assertIn('Only base64 data is allowed', str(caught.exception))
        self.assertEqual(caught.exception.cleanup_failures, ('remove-signing-tempdir',))
        self.assertEqual(self.calls(fake, 'security:create-keychain'), [])

    def test_early_setup_failure_tears_down_tempdir_without_a_primary_cleanup_failure(self):
        env = self.signed_env()
        env['IOS_CERTIFICATE_BASE64'] = 'not-valid-base64!!'
        with self.assertRaises(ValueError):
            self.run_main(FakeRunner(), env)
        leftovers = [path for path in self.runner_temp.iterdir() if path.is_dir()]
        self.assertEqual(leftovers, [])

    def test_all_owned_cleanups_including_teardown_are_attempted(self):
        fake = FakeRunner()
        fake.fail_on(is_search_list_restore, OSError('restore failed'))
        fake.fail_on('security:delete-keychain', OSError('delete failed'))
        real_unlink = pathlib.Path.unlink
        unlinked = []

        def failing_unlink(path, missing_ok=False):
            text = str(path)
            if (text.endswith(KEYCHAIN_NAME) or text == str(self.installed)) and text not in unlinked:
                unlinked.append(text)
                raise OSError('unlink failed')
            return real_unlink(path, missing_ok=missing_ok)

        with mock.patch.object(pathlib.Path, 'unlink', failing_unlink), \
                mock.patch.object(archive_ios.tempfile.TemporaryDirectory, 'cleanup',
                                  side_effect=OSError('teardown failed')):
            with self.assertRaises(archive_ios.CleanupError) as caught:
                self.run_main(fake, self.signed_env())
        self.assertEqual(caught.exception.failures, (
            'restore-keychain-search-list',
            'delete-keychain',
            'remove-keychain-file',
            'remove-installed-profile',
            'remove-signing-tempdir',
        ))

    def test_cancellation_during_cleanup_is_not_swallowed(self):
        real_unlink = pathlib.Path.unlink

        def interrupting_unlink(path, missing_ok=False):
            if pathlib.Path(path) == self.installed:
                raise CleanupCancelled()
            return real_unlink(path, missing_ok=missing_ok)

        with mock.patch.object(pathlib.Path, 'unlink', interrupting_unlink):
            with self.assertRaises(CleanupCancelled):
                self.run_main(FakeRunner(), self.signed_env())

    def test_cancellation_during_cleanup_does_not_replace_primary(self):
        primary = subprocess.CalledProcessError(65, ['xcodebuild'])
        fake = FakeRunner()
        fake.fail_on('xcodebuild:-project', primary)
        real_unlink = pathlib.Path.unlink

        def interrupting_unlink(path, missing_ok=False):
            if pathlib.Path(path) == self.installed:
                raise CleanupCancelled()
            return real_unlink(path, missing_ok=missing_ok)

        with mock.patch.object(pathlib.Path, 'unlink', interrupting_unlink):
            with self.assertRaises(subprocess.CalledProcessError) as caught:
                self.run_main(fake, self.signed_env())
        self.assertIs(caught.exception, primary)


class PathValidationTest(ArchiveIosHarness):
    """Path-derived identifiers are rejected before any native work."""

    def assert_rejected(self, env, pattern):
        fake = FakeRunner()
        with self.assertRaisesRegex(ValueError, pattern):
            self.run_main(fake, env)
        self.assertEqual(fake.calls, [], 'no native command may run after rejection')
        self.assertTrue(self.profile_dir_is_empty())

    def test_traversal_in_asc_key_id_is_rejected(self):
        for value in ('../../evil', 'a/b', '..', '/etc/passwd', 'ABCDE1234 ',
                      'abcde12345', 'SHORT', 'A' * 11, ''):
            with self.subTest(value=value):
                self.assert_rejected(self.signed_env(ASC_KEY_ID=value), 'ASC_KEY_ID')

    def test_non_conforming_team_id_is_rejected(self):
        for value in ('TEAM123', 'team123456', 'TEAM12345', '../evil', ''):
            with self.subTest(value=value):
                self.assert_rejected(self.signed_env(APPLE_TEAM_ID=value), 'APPLE_TEAM_ID')

    def test_malformed_issuer_uuid_is_rejected(self):
        for value in ('not-a-uuid', 'ISSUER-1', '../../evil',
                      '11111111-2222-3333-4444-55555555555', ''):
            with self.subTest(value=value):
                self.assert_rejected(self.signed_env(ASC_ISSUER_ID=value), 'ASC_ISSUER_ID')

    def test_profile_uuid_traversal_is_rejected_after_decode(self):
        fake = FakeRunner(profile_bytes=profile_plist(uuid='../../evil'))
        with self.assertRaisesRegex(ValueError, 'provisioning profile UUID'):
            self.run_main(fake, self.signed_env())
        self.assertIn(('security', 'cms'), [call[:2] for call in fake.calls])
        for forbidden in ('create-keychain', 'import', 'list-keychains'):
            self.assertEqual(self.calls(fake, 'security:' + forbidden), [])
        self.assertTrue(self.profile_dir_is_empty())

    def test_profile_uuid_missing_is_rejected(self):
        fake = FakeRunner(profile_bytes=plistlib.dumps({'Entitlements': {
            'application-identifier': TEAM + '.' + BUNDLE, 'aps-environment': 'production'}}))
        with self.assertRaisesRegex(ValueError, 'provisioning profile UUID'):
            self.run_main(fake, self.signed_env())
        self.assertEqual(self.calls(fake, 'security:create-keychain'), [])


    def test_trailing_newline_in_identifiers_is_rejected(self):
        # `re.match` with a trailing `$` accepts one trailing newline; each
        # identifier must be matched in full.
        for field, valid in (('ASC_KEY_ID', 'ABCDE12345'),
                             ('APPLE_TEAM_ID', 'ABCDE12345'),
                             ('ASC_ISSUER_ID', '11111111-2222-3333-4444-555555555555')):
            with self.subTest(field=field):
                self.assert_rejected(self.signed_env(**{field: valid + '\n'}), field)

    def test_trailing_newline_in_profile_uuid_is_rejected(self):
        fake = FakeRunner(profile_bytes=profile_plist(
            uuid='11111111-2222-3333-4444-555555555555\n'))
        with self.assertRaisesRegex(ValueError, 'provisioning profile UUID'):
            self.run_main(fake, self.signed_env())
        self.assertEqual(self.calls(fake, 'security:create-keychain'), [])
        self.assertTrue(self.profile_dir_is_empty())


class CliBoundaryTest(ArchiveIosHarness):
    """The CLI boundary prints fixed labels, never argv."""

    def guard(self, fake, env):
        with mock.patch.dict(os.environ, env, clear=True), \
                mock.patch.object(archive_ios, 'subprocess', fake), \
                mock.patch.object(archive_ios.secrets, 'token_urlsafe', lambda size: 'keychain-secret'):
            return archive_ios.archive_with_cli_guard()

    def test_argv_secret_is_never_printed(self):
        sentinel = 'SENTINEL-ARGV-SECRET'
        fake = FakeRunner()
        fake.fail_on('security:import',
                     subprocess.CalledProcessError(65, ['security', 'import', '-P', sentinel]))
        stderr = io.StringIO()
        with mock.patch.object(archive_ios.sys, 'stderr', stderr):
            self.assertEqual(self.guard(fake, self.signed_env()), 1)
        rendered = stderr.getvalue()
        self.assertNotIn(sentinel, rendered)
        self.assertNotIn('cert-secret', rendered)
        self.assertNotIn('security import', rendered)
        self.assertIn('ios-signing', rendered)
        self.assertIn('CalledProcessError', rendered)

    def test_consent_rejection_label(self):
        fake = FakeRunner()
        env = self.signed_env()
        del env['IOS_DISTRIBUTION_OPT_IN']
        stderr = io.StringIO()
        with mock.patch.object(archive_ios.sys, 'stderr', stderr):
            self.assertEqual(self.guard(fake, env), 1)
        self.assertIn('ios-signing-consent', stderr.getvalue())
        self.assertEqual(fake.calls, [])

    def test_success_returns_zero(self):
        with mock.patch.object(archive_ios.sys, 'stderr', io.StringIO()):
            self.assertEqual(self.guard(FakeRunner(), self.signed_env()), 0)

    def test_original_exception_still_observable(self):
        primary = subprocess.CalledProcessError(65, ['security', 'import', '-P', 'SENTINEL'])
        fake = FakeRunner()
        fake.fail_on('security:import', primary)
        with mock.patch.object(archive_ios.sys, 'stderr', io.StringIO()):
            with self.assertRaises(subprocess.CalledProcessError) as caught:
                self.run_main(fake, self.signed_env())
        self.assertIs(caught.exception, primary)

    def test_timeout_with_argv_is_sanitized(self):
        timeout = subprocess.TimeoutExpired(
            ['security', 'import', '-P', 'SENTINEL-TIMEOUT-SECRET'], 900)
        fake = FakeRunner()
        fake.fail_on('security:import', timeout)
        stderr = io.StringIO()
        with mock.patch.object(archive_ios.sys, 'stderr', stderr):
            self.assertEqual(self.guard(fake, self.signed_env()), 1)
        rendered = stderr.getvalue()
        self.assertNotIn('SENTINEL-TIMEOUT-SECRET', rendered)
        self.assertIn('TimeoutExpired', rendered)

    def test_unexpected_ordinary_exception_is_sanitized(self):
        exploding = RuntimeError("boom: ['security','import','-P','SENTINEL-RUNTIME-SECRET']")
        fake = FakeRunner()
        fake.fail_on('security:import', exploding)
        stderr = io.StringIO()
        with mock.patch.object(archive_ios.sys, 'stderr', stderr):
            self.assertEqual(self.guard(fake, self.signed_env()), 1)
        rendered = stderr.getvalue()
        self.assertNotIn('SENTINEL-RUNTIME-SECRET', rendered)
        self.assertNotIn('boom', rendered)
        self.assertIn('RuntimeError', rendered)

    def test_cancellation_is_not_swallowed(self):
        class Cancelled(BaseException):
            pass

        fake = FakeRunner()
        fake.fail_on('security:import', Cancelled('cancel'))
        with mock.patch.object(archive_ios.sys, 'stderr', io.StringIO()):
            with self.assertRaises(Cancelled):
                self.guard(fake, self.signed_env())


if __name__ == '__main__': unittest.main()
