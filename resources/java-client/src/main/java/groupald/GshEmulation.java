package groupald;

import bsh.Interpreter;

class GshEmulation {
    public static void main(String[] args) throws java.io.FileNotFoundException, java.io.IOException, bsh.EvalError {
        Interpreter i = new Interpreter();
        i.source("gsh-emulation-commands.bsh");
        i.source(args[0]);
    }
}
