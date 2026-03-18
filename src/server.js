import { loadConfig } from "./config.js";
import { startServer } from "./app-factory.js";

const config = loadConfig();
await startServer({ config });
