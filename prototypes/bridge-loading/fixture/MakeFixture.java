// THROWAWAY PROTOTYPE for issue #2. Writes a one-book fixture library: <root>/Prototype Series/001.cbz
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import javax.imageio.ImageIO;

public class MakeFixture {
    public static void main(String[] args) throws Exception {
        Path series = Path.of(args[0], "Prototype Series");
        Files.createDirectories(series);
        BufferedImage page = new BufferedImage(200, 300, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream png = new ByteArrayOutputStream();
        ImageIO.write(page, "png", png);
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(series.resolve("001.cbz")))) {
            zip.putNextEntry(new ZipEntry("001.png"));
            zip.write(png.toByteArray());
            zip.closeEntry();
        }
    }
}
