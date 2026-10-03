# Salary Duel

Salary Duel is a head-to-head fantasy football game where each matchup receives its own randomized 50-player pool and salary prices.

## Stack

- Node.js 24
- Vercel Node server
- Supabase for persistent league state
- Sleeper for NFL data
- Browser UI with no frontend build step

## Deploy

1. Import this GitHub repository into Vercel.
2. Use the repository root as the project root.
3. Add these environment variables for Production, Preview, and Development:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
4. Deploy.

Vercel detects `src/server.ts` automatically and runs it as the Node application.

Do not commit the Supabase key to GitHub. Keep it in Vercel environment variables.

## Beta game flow

1. Commissioner creates a league.
2. Commissioner receives a private access code for every team.
3. Commissioner sends each friend their team code.
4. Commissioner opens the NFL week.
5. Each matchup receives the same 50-player pool for both opponents.
6. Each player builds an 8-player lineup under the salary cap.
7. Commissioner locks the week.
8. The app scores the matchup and updates standings.

## Current lineup

- 1 QB
- 2 RB
- 3 WR
- 2 FLEX
- Half-PPR scoring
- Default $50,000 salary cap

## Important beta note

The Sleeper provider is isolated behind `src/providers/sleeper.js`. Before treating the app as production-ready, verify the current-season weekly projection feed and injury/inactive handling for the NFL week being played.
