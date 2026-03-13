//! N-API addon for GSD.
//!
//! Exposes high-performance Rust modules to Node.js via napi-rs.
//! ```text
//! JS (packages/native) -> N-API -> Rust modules (ast, clipboard, grep, image, ...)
//! ```

#![allow(clippy::needless_pass_by_value)]

mod ast;
mod clipboard;
mod grep;
mod image;
mod task;
