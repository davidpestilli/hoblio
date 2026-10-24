use std::sync::atomic::{AtomicBool, Ordering};

static RUN_CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);

pub fn reset_run_cancel() {
    RUN_CANCEL_REQUESTED.store(false, Ordering::SeqCst);
}

pub fn request_run_cancel() {
    RUN_CANCEL_REQUESTED.store(true, Ordering::SeqCst);
}

pub fn run_cancel_requested() -> bool {
    RUN_CANCEL_REQUESTED.load(Ordering::SeqCst)
}
