//! Blocking work scheduling for N-API exports.
//!
//! Runs CPU-bound or blocking Rust work on libuv's thread pool via napi's
//! `Task` trait, keeping the main JS thread free.

use std::time::{Duration, Instant};

use napi::{Env, Error, Result, Task, bindgen_prelude::*};

/// Token for cooperative cancellation of blocking work.
#[derive(Clone, Default)]
pub struct CancelToken {
    deadline: Option<Instant>,
}

impl From<()> for CancelToken {
    fn from((): ()) -> Self {
        Self::default()
    }
}

impl CancelToken {
    /// Create a new cancel token from an optional timeout in milliseconds.
    #[allow(dead_code)]
    pub fn new(timeout_ms: Option<u32>) -> Self {
        Self {
            deadline: timeout_ms
                .map(|ms| Instant::now() + Duration::from_millis(ms as u64)),
        }
    }

    /// Check if cancellation has been requested.
    #[allow(dead_code)]
    pub fn heartbeat(&self) -> Result<()> {
        if let Some(deadline) = self.deadline {
            if deadline < Instant::now() {
                return Err(Error::from_reason("Aborted: Timeout"));
            }
        }
        Ok(())
    }
}

/// Task that runs blocking work on libuv's thread pool.
pub struct Blocking<T>
where
    T: Send + 'static,
{
    cancel_token: CancelToken,
    work: Option<Box<dyn FnOnce(CancelToken) -> Result<T> + Send>>,
}

impl<T> Task for Blocking<T>
where
    T: ToNapiValue + TypeName + Send + 'static,
{
    type JsValue = T;
    type Output = T;

    fn compute(&mut self) -> Result<Self::Output> {
        let work = self
            .work
            .take()
            .ok_or_else(|| Error::from_reason("BlockingTask: work already consumed"))?;
        work(self.cancel_token.clone())
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

pub type Async<T> = AsyncTask<Blocking<T>>;

/// Create an `AsyncTask` that runs blocking work on libuv's thread pool.
pub fn blocking<T, F>(
    _tag: &'static str,
    cancel_token: impl Into<CancelToken>,
    work: F,
) -> AsyncTask<Blocking<T>>
where
    F: FnOnce(CancelToken) -> Result<T> + Send + 'static,
    T: ToNapiValue + TypeName + Send + 'static,
{
    AsyncTask::new(Blocking {
        cancel_token: cancel_token.into(),
        work: Some(Box::new(work)),
    })
}
