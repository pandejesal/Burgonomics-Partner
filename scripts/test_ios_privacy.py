"""Static privacy-manifest contract for the Partner iOS app.

Parses the real `PrivacyInfo.xcprivacy` with the standard-library `plistlib`, so
this runs on any machine with Python and needs no macOS, Xcode, signing or
native command.

Scope, deliberately narrow: this pins what the *app bundle* declares. It is not
an aggregated built-framework privacy report, not proof that every SDK's own
manifest is compliant, and not App Store acceptance. Those need a resolved
Xcode archive.

Ownership evidence used to justify the assertions (bounded source scans, not
binary proof):

- `parent-partner-ios-api-inventory-r1.json` in the phase39 evidence folder:
  146 native source files across `ios/App/App`, `@capacitor`, `@capacitor-firebase`
  and `@aparajita`; exactly 6 matches, all `UserDefaults`; zero
  `FileTimestamp`, `DiskSpace` or `SystemBootTime` matches.
- Those 6 are `@capacitor/preferences` `Preferences.swift:18-19`
  (`UserDefaults.standard`) and its migration path
  `PreferencesPlugin.swift:89-114` — the app-only defaults store.
- The installed Capacitor 8.6.0 bundled `PrivacyInfo.xcprivacy` files declare
  empty accessed-API arrays.
- `App.entitlements` declares no App Group.
"""

import hashlib
import json
import plistlib
import unittest
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent
MANIFEST = APP_ROOT / "ios" / "App" / "App" / "PrivacyInfo.xcprivacy"
INFO_PLIST = APP_ROOT / "ios" / "App" / "App" / "Info.plist"
ENTITLEMENTS = APP_ROOT / "ios" / "App" / "App" / "App.entitlements"

# Categories whose app-level declarations had no supporting call site.
UNSUPPORTED_CATEGORIES = {
    "NSPrivacyAccessedAPICategoryFileTimestamp": "C617.1",
    "NSPrivacyAccessedAPICategoryDiskSpace": "85F4.1",
    "NSPrivacyAccessedAPICategorySystemBootTime": "35F9.1",
}

USER_DEFAULTS_CATEGORY = "NSPrivacyAccessedAPICategoryUserDefaults"


def load_manifest():
    with MANIFEST.open("rb") as handle:
        return plistlib.load(handle)


def accessed_api_map(manifest):
    """Category -> sorted reasons, as declared in the app manifest."""
    return {
        entry["NSPrivacyAccessedAPIType"]: sorted(entry.get("NSPrivacyAccessedAPITypeReasons", []))
        for entry in manifest.get("NSPrivacyAccessedAPITypes", [])
    }


def collected_data_digest(manifest):
    """Hash of the collected-data block, so it can be proven unchanged."""
    block = manifest.get("NSPrivacyCollectedDataTypes", [])
    return hashlib.sha256(json.dumps(block, sort_keys=True).encode("utf-8")).hexdigest()


class AccessedAPIDeclarations(unittest.TestCase):
    def setUp(self):
        self.manifest = load_manifest()
        self.declared = accessed_api_map(self.manifest)

    def test_user_defaults_is_declared_with_ca92_1(self):
        # CA92.1 is the app-only defaults reason. It is the one category with a
        # traced call site (@capacitor/preferences).
        self.assertIn(USER_DEFAULTS_CATEGORY, self.declared)
        self.assertEqual(self.declared[USER_DEFAULTS_CATEGORY], ["CA92.1"])

    def test_user_defaults_does_not_claim_app_group_access(self):
        # 1C8F.1 means defaults shared between App Group members. The app has no
        # App Group entitlement and the plugin uses UserDefaults.standard, so
        # claiming it would be a false declaration.
        self.assertNotIn(
            "1C8F.1",
            self.declared.get(USER_DEFAULTS_CATEGORY, []),
            "App Group defaults reason is not supported by app entitlements or plugin code",
        )

    def test_unsupported_categories_are_absent(self):
        for category, code in UNSUPPORTED_CATEGORIES.items():
            with self.subTest(category=category):
                self.assertNotIn(
                    category,
                    self.declared,
                    f"{category} has no app/plugin call site; {code} must not be declared",
                )

    def test_no_category_carries_an_invented_reason(self):
        # E174.1 is the low-space *check* reason. Neither it nor a disk-space
        # display feature exists, so it must never appear as a substitute.
        all_reasons = {code for codes in self.declared.values() for code in codes}
        self.assertNotIn("E174.1", all_reasons)
        self.assertEqual(all_reasons, {"CA92.1"})

    def test_every_declared_entry_has_a_known_shape(self):
        for entry in self.manifest.get("NSPrivacyAccessedAPITypes", []):
            self.assertIsInstance(entry["NSPrivacyAccessedAPIType"], str)
            self.assertTrue(entry["NSPrivacyAccessedAPITypeReasons"])


class TrackingAndCollectedData(unittest.TestCase):
    def setUp(self):
        self.manifest = load_manifest()

    def test_tracking_stays_off_and_has_no_domains(self):
        self.assertIs(self.manifest["NSPrivacyTracking"], False)
        self.assertEqual(self.manifest["NSPrivacyTrackingDomains"], [])

    def test_collected_data_block_is_byte_stable(self):
        # Pinned so a later edit to the accessed-API section cannot quietly
        # change Nutrition Label claims. The expected digest is recorded from
        # the pre-change manifest.
        self.assertEqual(
            collected_data_digest(self.manifest),
            "b4466b5d91115432fc13ab0064b9c54c89b2ddd3a9e2efc089448906c41ec1c1",
            "collected-data declarations changed; re-review them explicitly",
        )


class AppBundleConfiguration(unittest.TestCase):
    def test_info_plist_has_no_arbitrary_load_ats_exception(self):
        with INFO_PLIST.open("rb") as handle:
            info = plistlib.load(handle)
        ats = info.get("NSAppTransportSecurity", {})
        self.assertNotIn(
            "NSAllowsArbitraryLoads",
            ats,
            "default ATS must apply; no arbitrary-load exception is approved",
        )

    def test_entitlements_declare_no_app_group(self):
        with ENTITLEMENTS.open("rb") as handle:
            entitlements = plistlib.load(handle)
        self.assertNotIn("com.apple.security.application-groups", entitlements)
        # Sanity: the file parsed as a real entitlements dict.
        self.assertIn("aps-environment", entitlements)


if __name__ == "__main__":
    unittest.main()
