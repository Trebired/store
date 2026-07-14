import { defineCodeDisciplineConfig } from "@trebired/code-discipline";

export default defineCodeDisciplineConfig({
  sourceRoot: "src",
  excludeDirs: {
    gitignore: true,
  },
  logging: {
    enabled: true,
    quiet: false,
  },
  tsconfigPaths: {
    normalize: "relative-dot-prefix",
    restoreAfterRun: false,
  },
  rules: {
    bannedPatterns: {
      patterns: [
        {
          value: "operlorn",
          allowedFiles: ["package.json"],
        },
      ],
    },
    maxFileLines: {
      max: 350,
    },
    maxFunctionLines: {
      max: 50,
    },
    folderizeCompoundFiles: {},
    removeComments: {
      exclude: ["@ts-nocheck"],
    },
    syncImports: {
      alias: {
        strategy: "random",
      },
      allowRelative: ["./"],
      packageJsonImports: {
        enabled: true,
        aliasPrefix: "#",
      },
    },
  },
});
