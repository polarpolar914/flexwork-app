#!/usr/bin/env node
// `npm link` 후 어디서든 `flexwork` 로 실행. tsx로 TypeScript 소스를 바로 로드한다.
require("tsx/cjs/api").register();
require("../src/cli/index.ts");
