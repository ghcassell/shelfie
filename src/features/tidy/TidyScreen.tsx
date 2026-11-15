import { Redirect } from 'expo-router';

/** The table is for a desktop browser (TidyScreen.web.tsx). On the phone the Larder is the place to tidy. */
export default function TidyScreen() {
  return <Redirect href="/" />;
}
