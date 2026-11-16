// Makes the debug (dev) build installable alongside the release (prod) build and
// visually distinct: app id com.shelfie.app.dev, label "Shelfie Dev", orange icon background.
const { withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SUFFIX_LINE = 'applicationIdSuffix ".dev"';

const icon = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/devIconBackground"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`;

const values = `<resources>
  <string name="app_name">Shelfie Dev</string>
  <color name="devIconBackground">#FF8A00</color>
</resources>
`;

module.exports = function withDevVariant(config) {
  config = withAppBuildGradle(config, (c) => {
    if (!c.modResults.contents.includes(SUFFIX_LINE)) {
      const before = c.modResults.contents;
      // First `debug {` after `buildTypes {` (the earlier one is in signingConfigs).
      c.modResults.contents = before.replace(
        /(buildTypes\s*\{\s*debug\s*\{)/,
        `$1\n            ${SUFFIX_LINE}`
      );
      if (c.modResults.contents === before) {
        throw new Error('withDevVariant: could not find buildTypes.debug in app/build.gradle');
      }
    }
    return c;
  });

  return withDangerousMod(config, [
    'android',
    (c) => {
      // The debug source set overrides main resources for debug builds only.
      const res = path.join(c.modRequest.platformProjectRoot, 'app/src/debug/res');
      const files = {
        'values/dev_variant.xml': values,
        'mipmap-anydpi-v26/ic_launcher.xml': icon,
        'mipmap-anydpi-v26/ic_launcher_round.xml': icon,
      };
      for (const [rel, content] of Object.entries(files)) {
        const file = path.join(res, rel);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content);
      }
      return c;
    },
  ]);
};
