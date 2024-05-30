/**
 * This file is based on the upstream transformer code from
 * https://github.com/ChristophP/parcel-transformer-elm-svg-modules/raw/main/src/ElmSvgModulesTransformer.js
 *
 * Original Author: Christoph “Deedo” Pölt
 *
 * This local version addresses an issue in `svg2elm` whereby each SVG comment
 * is transcribed as a blank Elm list item (more precisely, an Elm comment
 * followed by a comma) in the generated Elm modules, which results in invalid
 * Elm code.
 *
 * Changes:
 *
 *  1. Added a function to strip the commas following comments.
 *
 *  2. Applied the comment-following-comma-stripping function to the generated
 *     module code.
 *
 * TODO: Fix the bug upstream in `svg2elm` and remove this local version.
 *
 * TODO: Alternatively or additionally, reimplement this transformer to adhere
 * to the intended design of Parcel transformers.  Presently, it's applied
 * to `*.elm` assets, but all it does with them is to invalidate them
 * in the build cache whenever the generated Elm SVG modules get updated;
 * the actual transformation—from SVG images to Elm modules—is performed
 * as a side effect, and the generated Elm modules apparently do not get
 * put through the transformer pipeline.  Instead, this transformer should
 * be implemented so as to apply to `*.svg` assets and transform them to the
 * corresponding `*.elm` files—just as any normal transformer plugin would—
 * and apply the cache invalidation for non-generated Elm modules
 * as a side effect.
 */

const ThrowableDiagnostic = require("@parcel/diagnostic");
const { Transformer } = require("@parcel/plugin");

const { generateModule } = require("svg2elm");
const glob = require("glob");
const fs = require("fs").promises;
const path = require("path");
const { promisify } = require("util");

const { md } = ThrowableDiagnostic;
const asyncGlob = promisify(glob);

const settle = (promise) =>
  Promise.allSettled([promise]).then(([{ value, reason }]) => [reason, value]);

function stripCommentFollowingCommas(code) {
  return code.replace(/(\{-.*?-}),/gs, "$1");
}

module.exports = new Transformer({
  async loadConfig({ config }) {
    const { contents } = await config.getConfig(["package.json"]);

    return contents.elmSvgModules;
  },
  async transform({ asset, config, logger }) {
    const generate = async ({
      inputSvgs,
      outputModuleName = "Icons",
      outputModuleDir = "src",
    }) => {
      const elmModulePath = outputModuleName
        .replaceAll(".", path.sep)
        .concat(".elm");
      const resolvedModulePath = path.join(outputModuleDir, elmModulePath);
      await fs.mkdir(path.dirname(resolvedModulePath), { recursive: true });

      logger.info({
        message: `Writing module to: ${resolvedModulePath} for ${inputSvgs}`,
      });

      // glob for svgs
      const [globErr, filePaths] = await settle(asyncGlob(inputSvgs, {}));
      if (globErr) {
        throw new ThrowableDiagnostic({
          diagnostic: {
            message: `Failed to resolve file path for ${outputModuleName}`,
            stack: globErr.stack,
          },
        });
      }

      logger.verbose({ message: `Found SVGs ${filePaths.join(", ")}` });

      // generate module code
      const [genErr, moduleCode] = await settle(
        generateModule(outputModuleName, filePaths),
      );

      if (genErr) {
        throw new ThrowableDiagnostic({
          diagnostic: {
            message: `Failed to generate ${outputModuleName}`,
            stack: genErr.stack,
          },
        });
      }

      // set up invalidations
      asset.invalidateOnFileCreate({ glob: inputSvgs });
      filePaths.forEach((filePath) => {
        asset.invalidateOnFileChange(filePath);
      });

      // Strip commas following comments from the generated module code
      const cleanedModuleCode = stripCommentFollowingCommas(moduleCode);

      // write generated Elm module to disk
      const finalCode = `-- THIS MODULE IS GENERATED. DON'T EDIT BY HAND.\n\n${cleanedModuleCode}`;

      const content = await fs
        .readFile(resolvedModulePath, "utf-8")
        .catch(() => "");

      // only write module if code is new or has changed
      if (content === "" || content !== finalCode) {
        await fs.writeFile(resolvedModulePath, finalCode);
      }
    };

    await Promise.allSettled(config.map(generate));

    logger.info({ message: md`Generated ${config.length} module(s)` });

    // Return the asset
    return [asset];
  },
});
