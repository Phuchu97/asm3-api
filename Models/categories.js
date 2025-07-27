const mongoose = require('mongoose');
const slugify = require('slugify');

const catgoriesSchema = mongoose.Schema({
    name: String,
    image: Object,
    description: String,
    parent_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'categories',
        default: null
    },
    status: {
        type: Boolean,
        default: true
    },
    order: {
        type: Number,
        default: 0
    },
    slug: {
        type: String,
        unique: true
    }
}, { timestamps: true });

// Tạo slug từ tên nếu không có
catgoriesSchema.pre('save', function(next) {
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

const CategoriesModel = mongoose.model('categories',catgoriesSchema);
module.exports = CategoriesModel;