import { body } from "express-validator";

/** Only JPEG posters from this CMS project's approved public storage path. */
export function isApprovedPoster(value: string) {
  try {
    const storage = new URL(process.env.PUBLIC_SUPABASE_URL || "");
    const url = new URL(value);
    const path = decodeURIComponent(url.pathname);
    return (
      storage.protocol === "https:" &&
      url.protocol === "https:" &&
      url.origin === storage.origin &&
      !url.username &&
      !url.password &&
      path.startsWith("/storage/v1/object/public/event-posters/public/") &&
      !path.split("/").some((segment) => segment === "." || segment === "..") &&
      /\.jpe?g$/i.test(path)
    );
  } catch {
    return false;
  }
}

export const checkMessageMiddleware = [
  body("message")
    .isString()
    .bail()
    .custom((v) => v.trim().length > 0)
    .withMessage("A nonempty message is required"),
  body("mediaUrl")
    .optional()
    .isString()
    .bail()
    .custom(isApprovedPoster)
    .withMessage("Use a JPG/JPEG poster URL from approved storage"),
  body("deliveryId")
    .optional()
    .isString()
    .bail()
    .notEmpty()
    .withMessage("deliveryId must be a nonempty string"),
  body("videoUrl")
    .not()
    .exists()
    .withMessage("Video publishing is unsupported"),
];
