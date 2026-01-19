public class DebugShift {
    public static void main(String[] args) {
        long value = 100L;
        long shifted = value << 24;
        System.out.println("100 in decimal: " + value);
        System.out.println("100 << 24 in decimal: " + shifted);
        System.out.println("100 << 24 in hex: 0x" + Long.toHexString(shifted));
    }
}
