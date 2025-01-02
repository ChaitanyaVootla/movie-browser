import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";

export const convertToWebp = async (image: string, quality: number = 80): Promise<string> => {
    // check if the image already exists
    const fileName = path.basename(image).split(".")[0];
    const filePath = `./public/data/images/${fileName}.webp`;
    if (fs.existsSync(filePath)) {
        return filePath;
    }
    try {
        // Fetch the image
        const response = await fetch(image);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
        }

        // Convert the image to a buffer
        const buffer = await response.arrayBuffer();
        const imageBuffer = Buffer.from(buffer);

        // Convert the image to WebP
        const webpBuffer = await sharp(imageBuffer)
            .webp({ quality })
            .toBuffer();

        // Create the output directory if it doesn't exist
        const outputDir = "./public/data/images";
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Generate the file path with a .webp extension
        const fileName = path.basename(image).split(".")[0]; // Get the base name without extension
        const filePath = path.join(outputDir, `${fileName}.webp`);

        // Write the WebP image to the file system
        // @ts-ignore
        fs.writeFileSync(filePath, webpBuffer);

        return filePath;
    } catch (error) {
        console.error("Error converting image to WebP:", error);
        throw error;
    }
};

export const generateItemWebp = async (item: any) => {
    if (item.backdrop_path) {
        convertToWebp(`https://image.tmdb.org/t/p/w1280${item.backdrop_path}`);
    }
    item = stripLogos(item);
    if (item.images?.logos?.length) {
        convertToWebp(`https://image.tmdb.org/t/p/w1280${item.images.logos[0].file_path}`);
    }
};
