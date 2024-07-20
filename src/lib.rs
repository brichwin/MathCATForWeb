use wasm_bindgen::prelude::*;
use libmathcat::*;

#[wasm_bindgen]
pub fn wasm_set_rules_dir(dir: String) -> Result<(), JsValue> {
    set_rules_dir(dir).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn wasm_get_version() -> String {
    get_version()
}

#[wasm_bindgen]
pub fn wasm_set_preference(name: String, value: String) -> Result<(), JsValue> {
    set_preference(name, value).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn wasm_set_mathml(mathml_str: String) -> Result<String, JsValue> {
    set_mathml(mathml_str).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn wasm_get_spoken_text() -> Result<String, JsValue> {
    get_spoken_text().map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn wasm_get_braille(nav_node_id: String) -> Result<String, JsValue> {
    get_braille(nav_node_id).map_err(|e| JsValue::from_str(&e.to_string()))
}
