use crate::variables::Environment;

pub struct ParseContext<'a> {
    pub input: &'a str,
    pub pos: &'a mut usize,
}

pub struct ParseEnvContextMut<'a> {
    pub input: &'a str,
    pub pos: &'a mut usize,
    pub env: &'a mut Environment,
}
