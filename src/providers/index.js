import mock from "./mock.js";
import sleeper from "./sleeper.js";
const providers={mock,sleeper};
export const PROVIDER_NAMES=Object.keys(providers);
export const getProvider=name=>providers[name]||providers.mock;