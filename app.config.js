// Dev start (APP_VARIANT=dev) targets the debug build's id (com.shelfie.app.dev, see
// plugins/withDevVariant) so pressing `a` in Metro finds it. Don't set it for prebuild/release.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    package: process.env.APP_VARIANT === 'dev' ? 'com.shelfie.app.dev' : config.android.package,
  },
});
