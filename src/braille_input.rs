//! Input clean-up for braille / ASCIIMath / LaTeX input, ported from the
//! MathCAT demo (daisy/MathCATDemo, `braille-parser` branch, src/main.rs).
//! MathCAT's parser itself expects Unicode braille for UEB/Nemeth and plain
//! text for ASCIIMath/LaTeX; this lets users type ASCII braille or use a
//! braille keyboard that sends computer-braille cells.

use std::collections::HashMap;
use std::sync::OnceLock;

pub const INPUT_CODES: &[&str] = &["UEB", "Nemeth", "ASCIIMath", "LaTeX"];

/// North American ASCII braille: index is (Unicode braille - 0x2800) & 0x3F.
const UNICODE_TO_ASCII_BRAILLE: &str =
    " A1B'K2L@CIF/MSP\"E3H9O6R^DJG>NTQ,*5<-U8V.%[$+X!&;:4\\0Z7(_?W]#Y)=";

fn uses_computer_braille(code: &str) -> bool {
    code == "ASCIIMath" || code == "LaTeX"
}

fn is_braille_cell(c: char) -> bool {
    (0x2800..=0x28FF).contains(&(c as u32))
}

fn is_unicode_braille_text(s: &str) -> bool {
    s.chars().all(|c| is_braille_cell(c) || c.is_whitespace())
}

/// North American Braille Computer Code. Dot 7 selects the uppercase block
/// (@, A-Z, brackets, ^); without it the lowercase block. Dot 8 is ignored.
fn computer_braille_cell_to_char(cell: u32) -> char {
    let index = ((cell - 0x2800) & 0x3F) as usize;
    let table_char = UNICODE_TO_ASCII_BRAILLE.chars().nth(index).unwrap();
    let dot7 = (cell & 0x40) != 0;
    let t = table_char as u32;
    match t {
        0x20..=0x3F => table_char,
        0x5F => if dot7 { '\u{7F}' } else { '_' },
        0x40..=0x5E => if dot7 { table_char } else { char::from_u32(t + 0x20).unwrap() },
        _ => table_char,
    }
}

fn computer_braille_to_text(input: &str) -> String {
    input.chars()
        .map(|ch| if is_braille_cell(ch) { computer_braille_cell_to_char(ch as u32) } else { ch })
        .collect()
}

fn ascii_braille_to_unicode(ascii: &str) -> String {
    static MAP: OnceLock<HashMap<char, char>> = OnceLock::new();
    let map = MAP.get_or_init(|| {
        let mut map = HashMap::with_capacity(128);
        for (i, ch) in UNICODE_TO_ASCII_BRAILLE.chars().enumerate() {
            let unicode = char::from_u32(0x2800 + i as u32).unwrap();
            map.insert(ch, unicode);
            if ch.is_ascii_uppercase() {
                map.insert(ch.to_ascii_lowercase(), unicode);
            }
        }
        map
    });
    ascii.chars().map(|c| map.get(&c).copied().unwrap_or(c)).collect()
}

fn ensure_unicode_braille(input: &str) -> String {
    if is_unicode_braille_text(input) { input.to_string() } else { ascii_braille_to_unicode(input) }
}

/// A typed space next to Unicode braille is the blank cell, not U+0020.
fn spaces_as_braille_blanks(input: &str) -> String {
    if input.chars().any(is_braille_cell) { input.replace(' ', "\u{2800}") } else { input.to_string() }
}

pub fn braille_input_text(input: &str, code: &str) -> String {
    let input = spaces_as_braille_blanks(input);
    if uses_computer_braille(code) {
        if is_unicode_braille_text(&input) { computer_braille_to_text(&input) } else { input }
    } else {
        ensure_unicode_braille(&input)
    }
}
