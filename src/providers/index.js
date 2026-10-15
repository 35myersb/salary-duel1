import mock from "./mock.js";
import sleeper from "./sleeper.js";

const strictSleeper = {
  ...sleeper,
  async getPlayers(season, week) {
    const players = await sleeper.getPlayers(season, week);
    return players.filter((player) => {
      const status = String(player.injuryStatus ?? "").trim().toLowerCase();
      return (!status || status === "healthy" || status === "questionable") && player.onBye !== true;
    });
  }
};

const providers = { mock, sleeper: strictSleeper };
export const PROVIDER_NAMES = Object.keys(providers);
export const getProvider = (name) => providers[name] || providers.mock;
