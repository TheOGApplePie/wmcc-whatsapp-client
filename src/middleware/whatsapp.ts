import { body } from 'express-validator';
export const checkMessageMiddleware =[
  body('message').notEmpty().withMessage("The message property is required").isString().withMessage("The message must be a string").escape(),
  body('mediaUrl').optional().isURL().withMessage("The mediaUrl must be a valid URL").custom(value => {
    const domainRegex = /^https?:\/\/gkpctbvyswcfccogoepl\.supabase\.co\/storage\/v1\/object\/public\/event-posters\/public\/([^?#]+)/
    return domainRegex.test(value)
}).withMessage("This media cannot be used in the whatsapp message service. Please upload the file and use the supabase URL")
]
