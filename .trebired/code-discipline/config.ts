import { defineCodeDisciplineConfig } from "@trebired/code-discipline";

export default defineCodeDisciplineConfig({
  presets: {
    use: ["trebired"],
  },
  rules: {
    bannedPatterns: {
      patterns: [
        { value: "operlorn", allowedFiles: ["package.json"] },
      ],
    },
  },
});
