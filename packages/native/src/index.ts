/**
 * @gsd/native — High-performance Rust modules exposed via N-API.
 *
 * Modules:
 * - ast: AST-aware structural search and rewrite
 * - clipboard: native clipboard access (text + image)
 * - grep: ripgrep-backed regex search (content + filesystem)
 * - image: decode, encode, and resize images
 */

export {
  copyToClipboard,
  readTextFromClipboard,
  readImageFromClipboard,
} from "./clipboard/index.js";
export type { ClipboardImage } from "./clipboard/index.js";

export { searchContent, grep } from "./grep/index.js";
export type {
  ContextLine,
  GrepMatch,
  GrepOptions,
  GrepResult,
  SearchMatch,
  SearchOptions,
  SearchResult,
} from "./grep/index.js";

export { astGrep, astEdit } from "./ast/index.js";
export type {
  AstFindMatch,
  AstFindOptions,
  AstFindResult,
  AstReplaceChange,
  AstReplaceFileChange,
  AstReplaceOptions,
  AstReplaceResult,
} from "./ast/index.js";

export { parseImage, ImageFormat, SamplingFilter } from "./image/index.js";
export type { NativeImageHandle } from "./image/index.js";
