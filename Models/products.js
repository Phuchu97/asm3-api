const mongoose = require('mongoose');
const slugify = require('slugify');

const productsSchema = mongoose.Schema({
    name: String,
    image: Array,
    price: Number,
    description_sale: String,
    description_detail: String,
    category_id: String,
    category_product: String,
    slug: {
        type: String,
        unique: true
    },
    specifications: Object,
    status: {
        type: Boolean,
        default: true
    },
    featured: {
        type: Boolean,
        default: false
    },
    keywords: [String]
}, { timestamps: true });

// Tạo slug từ tên nếu không có
productsSchema.pre('save', function(next) {
    if (!this.slug && this.name) {
        this.slug = slugify(this.name, {
            lower: true,      // convert to lower case
            locale: 'vi',     // language code of the locale to use
            trim: true,       // trim leading and trailing replacement chars
            strict: true      // strip special characters except replacement
        });
    }
    next();
});

const ProductsModel = mongoose.model('products',productsSchema);
module.exports = ProductsModel;