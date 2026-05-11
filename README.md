# music cal

turn your calendar into a fun song! this project was inspired while i was looking at my very busy calendar and thought it looked like those tiktok filters where u can click squares to make a song iykwim
> also semi inspired by google's piano roll website

music cal is a Next.js app that:
- signs in with Google (NextAuth)
- reads calendar events (read-only)
- visualizes events as a colorful weekly grid
- plays a generated audio pattern from your schedule
- supports uploading a local `.ics` calendar file as an alternative to Google sign-in

## features
- Google OAuth login with calendar read-only scope
- month/week calendar UI (FullCalendar)
- interactive song grid + playback controls (volume/speed)
- click events to open the original event link
- `.ics` upload mode for local calendar files
- privacy policy and terms pages for Google Cloud Console

## usage
1. sign in with Google **or** upload a `.ics` file
2. view your events in the calendar + song grid
3. press **Play** to hear your schedule as music
4. click any event block to open the source calendar event

## psa
- if Google shows **"Google hasn’t verified this app"**, click **Advanced** and continue to Music Cal.
- this warning can appear while the OAuth app is still pending full Google verification (may take up to a week sorry :(()

## installation
1. **Clone the repository**
   ```bash
   git clone https://github.com/sophia0805/calendar
   cd calendar
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create `.env`**
   ```bash
   AUTH_GOOGLE_ID=your_google_client_id
   AUTH_GOOGLE_SECRET=your_google_client_secret
   AUTH_SECRET=your_random_secret
   NEXTAUTH_URL=http://localhost:3000
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## deployment notes (vercel + google oauth)
- set the same env vars in Vercel (with production values)
- set `NEXTAUTH_URL` to your live URL (ex: `https://music-cal.vercel.app`)
- in Google Cloud OAuth client, add redirect URI:
  - `https://music-cal.vercel.app/api/auth/callback/google`
- enable Google Calendar API and include scope:
  - `https://www.googleapis.com/auth/calendar.readonly`