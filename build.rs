fn main() {
    // Check if the target family is "wasm"
    if std::env::var("CARGO_CFG_TARGET_FAMILY").unwrap_or_default() == "wasm" {
        // Set the target family to "wasm"
        println!("cargo:rustc-cfg=target_family=\"wasm\"");
    }
}
