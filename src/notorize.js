require("dotenv").config();
const { notarize } = require("electron-notarize");
const path = require("path");

exports.default = async function notarizing(context) {
  // Skip notarization in development mode
  if (process.env.CSC_FORCE_SIGN === "false") {
    console.log("Skipping notarization in development mode");
    return;
  }

  // Get build information from context
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") {
    console.log("Skipping notarization for non-macOS platform");
    return;
  }

  console.log("Notarizing macOS application...");

  // Get application information from package.json
  const { appId, productName } = context.packager.config.appInfo;
  const appPath = path.join(appOutDir, `${productName}.app`);

  try {
    console.log(`Notarizing ${appId} at ${appPath}`);

    await notarize({
      tool: "notarytool",
      appPath,
      teamId: process.env.APPLE_TEAM_ID,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASSWORD,
    });

    console.log(`Successfully notarized ${productName}`);
  } catch (error) {
    console.error("Error during notarization:", error);
    throw error;
  }
};
