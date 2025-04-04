const { MakerSquirrel } = require("@electron-forge/maker-squirrel");
const { MakerZIP } = require("@electron-forge/maker-zip");
const { MakerDeb } = require("@electron-forge/maker-deb");
const { MakerRpm } = require("@electron-forge/maker-rpm");
const { VitePlugin } = require("@electron-forge/plugin-vite");
const { PublisherGithub } = require("@electron-forge/publisher-github");
const path = require("path");

// Load env variables for signing and GitHub token
require("dotenv").config();

module.exports = {
  packagerConfig: {
    asar: true,
    icon: path.join(__dirname, "src/images/icon"),
    appBundleId: "com.afightclub.mini",
    appCategoryType: "public.app-category.graphics-design",
    osxSign: {
      identity: process.env.APPLE_DEVELOPER_IDENTITY,
      hardenedRuntime: true,
      entitlements: path.join(__dirname, "entitlements.plist"),
      entitlementsInherit: path.join(__dirname, "entitlements.plist"),
      "gatekeeper-assess": false,
    },
    osxNotarize: {
      tool: "notarytool",
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    },
    extraResource: [path.join(__dirname, "src/images/icon.png")],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: "Mini",
      iconUrl:
        "https://raw.githubusercontent.com/aFightClub/Mini/main/src/images/icon.ico",
      setupIcon: path.join(__dirname, "src/images/icon.ico"),
      loadingGif: path.join(__dirname, "src/images/installer.gif"),
    }),
    new MakerZIP({}, ["darwin"]),
    new MakerDeb({
      options: {
        icon: path.join(__dirname, "src/images/icon.png"),
      },
    }),
    new MakerRpm({
      options: {
        icon: path.join(__dirname, "src/images/icon.png"),
      },
    }),
  ],
  publishers: [
    new PublisherGithub({
      repository: {
        owner: "aFightClub",
        name: "Mini",
      },
      prerelease: false,
      draft: true,
      token: process.env.GITHUB_TOKEN,
    }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: path.join(__dirname, "src/main/index.js"),
          config: "vite.config.ts",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.config.ts",
        },
      ],
    }),
  ],
  hooks: {
    postMake: async (forgeConfig, artifacts) => {
      // Log artifacts for debugging
      console.log("Built artifacts:", artifacts);
      return artifacts;
    },
    packageAfterCopy: async (
      config,
      buildPath,
      electronVersion,
      platform,
      arch
    ) => {
      if (platform === "darwin") {
        const notarize = require("./src/notorize.js").default;
        await notarize(config);
      }
    },
  },
};
