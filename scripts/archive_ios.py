"""Archive locally on macOS; export only, never upload or deploy."""
import base64
import os
import pathlib
import plistlib
import secrets
import shlex
import subprocess
import sys
import tempfile

SIGNING_KEYS = ('ASC_API_KEY_BASE64', 'ASC_KEY_ID', 'ASC_ISSUER_ID', 'APPLE_TEAM_ID',
                'IOS_CERTIFICATE_BASE64', 'IOS_CERTIFICATE_PASSWORD', 'IOS_PROFILE_BASE64')
BUNDLE_ID = 'com.burgonomics.partner'
KEYCHAIN_FILENAME = 'signing.keychain-db'


def signing_mode(env):
    present = [key for key in SIGNING_KEYS if env.get(key)]
    if not present:
        return 'unsigned'
    missing = [key for key in SIGNING_KEYS if not env.get(key)]
    if missing:
        raise ValueError('Incomplete iOS signing secrets: ' + ', '.join(missing))
    return 'signed'


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


class CleanupError(RuntimeError):
    """Fail closed: an owned cleanup step failed and no primary error existed."""

    def __init__(self, failures):
        self.failures = tuple(failures)
        super().__init__('iOS signing cleanup failed: ' + ', '.join(self.failures))


def _report_cleanup_failure(label, error):
    """Best-effort diagnostics: never argv, paths, secrets or exception text.

    A diagnostic sink can itself fail (closed pipe, unreadable stderr). That must
    never interrupt the remaining cleanup steps or replace the primary error, so
    the write is guarded and its own failure is discarded.
    """
    try:
        print('warning: signed archive cleanup step failed: ' + label
              + ' (' + type(error).__name__ + ')', file=sys.stderr, flush=True)
    except Exception:
        # Only ordinary sink failures are swallowed; genuine cancellation is not.
        pass


def _write_owned_file(path, data, register_owner):
    """Create `path` exclusively, then write it. `register_owner` runs at creation.

    O_EXCL decides ownership atomically, so a preexisting or concurrently
    installed file is never adopted. Registering before the first write means a
    partially written file is still ours to remove, while a failed exclusive
    creation leaves foreign files untouched.
    """
    try:
        descriptor = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        raise ValueError('Refusing to overwrite existing provisioning profile') from None
    primary = None
    try:
        register_owner()
        remaining = memoryview(data)
        while remaining:
            written = os.write(descriptor, remaining)
            if written <= 0:
                raise OSError('short write while installing owned file')
            remaining = remaining[written:]
    except BaseException as error:
        primary = error
        raise
    finally:
        try:
            os.close(descriptor)
        except OSError:
            # A close failure must not replace the write failure that caused it.
            if primary is None:
                raise


def _delete_keychain(keychain):
    result = subprocess.run(['security', 'delete-keychain', keychain], check=False,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    # Keychain creation is owned from before the command runs, so any nonzero
    # status is a cleanup failure; the next step still clears any left-over file.
    if result.returncode != 0:
        raise OSError('cleanup command exited with status ' + str(result.returncode))


def _cleanup(directory, keychain, previous, installed, profile_owned, keychain_attempted,
             search_list_attempted):
    """Attempt every owned cleanup step; return (failed_labels, cancellation).

    Labels are fixed strings so diagnostics never contain argv, secrets or
    exception text. The restore argv is the exact pre-run list as parsed,
    including entries containing spaces and the empty list; what `security` does
    with an empty list is not asserted here because it is macOS-only.

    Each step is isolated, so one failure (command, OS or diagnostic) cannot stop
    the rest. A BaseException that is not an ordinary Exception (cancellation) is
    remembered and re-raised only when no primary error already exists.
    """
    steps = []
    if search_list_attempted:
        steps.append(('restore-keychain-search-list',
                      lambda: run('security', 'list-keychains', '-d', 'user', '-s', *previous)))
    if keychain_attempted:
        steps.append(('delete-keychain', lambda: _delete_keychain(keychain)))
        steps.append(('remove-keychain-file',
                      lambda: pathlib.Path(keychain).unlink(missing_ok=True)))
    if profile_owned:
        steps.append(('remove-installed-profile',
                      lambda: installed.unlink(missing_ok=True)))
    # Owned temporary-directory teardown runs last and unconditionally, so a
    # failed native step cannot strand the run's secrets on disk. It is never
    # configured to ignore errors: a teardown failure is a cleanup failure.
    steps.append(('remove-signing-tempdir', directory.cleanup))
    failures = []
    cancellation = None
    for label, action in steps:
        try:
            action()
        except BaseException as error:
            failures.append(label)
            if not isinstance(error, Exception) and cancellation is None:
                cancellation = error
            try:
                _report_cleanup_failure(label, error)
            except BaseException as report_error:
                # Diagnostics are best effort: a broken sink must neither stop
                # the remaining steps nor replace the error being reported.
                if not isinstance(report_error, Exception) and cancellation is None:
                    cancellation = report_error
    return tuple(failures), cancellation


def _signed_archive(archive):
    # The temporary directory is created first and torn down inside the same
    # protected region as every other owned resource: on Python the context
    # manager's __exit__ would otherwise run after our finally and could replace
    # a primary build error with a teardown OSError.
    directory = tempfile.TemporaryDirectory(prefix='ios-signing-', dir=os.environ.get('RUNNER_TEMP'))
    root = pathlib.Path(directory.name)
    keychain = str(root / KEYCHAIN_FILENAME)
    installed = None
    installed_owned = False
    keychain_attempted = False
    search_list_attempted = False
    previous = []
    primary = None

    def register_owner():
        nonlocal installed_owned
        installed_owned = True

    try:
        key = root / ('AuthKey_' + os.environ['ASC_KEY_ID'] + '.p8')
        cert = root / 'distribution.p12'
        profile = root / 'profile.mobileprovision'
        for path, name in [(key, 'ASC_API_KEY_BASE64'), (cert, 'IOS_CERTIFICATE_BASE64'), (profile, 'IOS_PROFILE_BASE64')]:
            path.write_bytes(base64.b64decode(os.environ[name], validate=True)); path.chmod(0o600)
        data = plistlib.loads(subprocess.check_output(['security', 'cms', '-D', '-i', str(profile)]))
        team = os.environ['APPLE_TEAM_ID']
        entitlements = data.get('Entitlements') or {}
        if entitlements.get('application-identifier') != team + '.' + BUNDLE_ID or entitlements.get('aps-environment') != 'production':
            raise ValueError('Distribution profile bundle/team or production push entitlement mismatch')
        installed = pathlib.Path.home() / 'Library/MobileDevice/Provisioning Profiles' / ('review-' + data['UUID'] + '.mobileprovision')
        installed.parent.mkdir(parents=True, exist_ok=True)
        password = secrets.token_urlsafe(32)
        previous = shlex.split(subprocess.check_output(['security', 'list-keychains', '-d', 'user'], text=True))
        _write_owned_file(installed, profile.read_bytes(), register_owner)
        keychain_attempted = True
        run('security', 'create-keychain', '-p', password, keychain)
        run('security', 'set-keychain-settings', '-lut', '21600', keychain)
        run('security', 'unlock-keychain', '-p', password, keychain)
        run('security', 'import', str(cert), '-P', os.environ['IOS_CERTIFICATE_PASSWORD'], '-A', '-t', 'cert', '-f', 'pkcs12', '-k', keychain, stdout=subprocess.DEVNULL)
        run('security', 'set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:', '-k', password, keychain, stdout=subprocess.DEVNULL)
        search_list_attempted = True
        run('security', 'list-keychains', '-d', 'user', '-s', keychain, *previous)
        auth = ['-allowProvisioningUpdates', '-authenticationKeyPath', str(key), '-authenticationKeyID', os.environ['ASC_KEY_ID'], '-authenticationKeyIssuerID', os.environ['ASC_ISSUER_ID']]
        run(*archive, *auth, 'DEVELOPMENT_TEAM=' + team, 'CODE_SIGN_STYLE=Manual', 'CODE_SIGN_IDENTITY=Apple Distribution', 'PROVISIONING_PROFILE_SPECIFIER=' + data['UUID'], 'archive')
        export = root / 'ExportOptions.plist'
        export.write_bytes(plistlib.dumps({'method': 'app-store-connect', 'destination': 'export', 'teamID': team, 'signingStyle': 'manual', 'signingCertificate': 'Apple Distribution', 'provisioningProfiles': {BUNDLE_ID: data['UUID']}}))
        run('xcodebuild', '-exportArchive', '-archivePath', 'build/App.xcarchive', '-exportPath', 'build/ipa', '-exportOptionsPlist', str(export), *auth)
    except BaseException as error:
        primary = error
        raise
    finally:
        failures, cancellation = _cleanup(directory, keychain, previous, installed,
                                          installed_owned, keychain_attempted,
                                          search_list_attempted)
        if primary is not None:
            if failures:
                try:
                    primary.cleanup_failures = failures
                except Exception:
                    pass
            raise
        if cancellation is not None:
            raise cancellation
        if failures:
            raise CleanupError(failures)


def main():
    mode = signing_mode(os.environ)
    archive = ['xcodebuild', '-project', 'ios/App/App.xcodeproj', '-scheme', 'App',
               '-configuration', 'Release', '-destination', 'generic/platform=iOS',
               '-archivePath', 'build/App.xcarchive']
    if mode == 'unsigned':
        print('Signing secrets absent: creating unsigned archive, not an IPA.', flush=True)
        run(*archive, 'CODE_SIGNING_ALLOWED=NO', 'archive')
    else:
        _signed_archive(archive)
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as output:
            output.write('signed=' + str(mode == 'signed').lower() + '\n')


if __name__ == '__main__':
    main()
