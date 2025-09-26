const mongoose = require('mongoose');
const slugify = require('slugify');

const productsSchema = mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true,
        minlength: [3, 'Product name must be at least 3 characters'],
        maxlength: [200, 'Product name must not exceed 200 characters']
    },
    images: [{
        url: {
            type: String,
            required: true
        },
        isPrimary: {
            type: Boolean,
            default: false
        },
        order: {
            type: Number,
            required: true
        },
        metadata: {
            size: {
                type: Number,
                default: 0
            },
            dimensions: {
                width: {
                    type: Number,
                    default: 0
                },
                height: {
                    type: Number,
                    default: 0
                }
            },
            format: {
                type: String,
                default: 'unknown'
            }
        }
    }],
    price: {
        type: Number,
        required: [true, 'Product price is required'],
        min: [0, 'Price cannot be negative']
    },
    description_sale: {
        type: String,
        required: [true, 'Product sale description is required'],
        trim: true
    },
    description_detail: {
        type: String,  // HTML content from ReactQuill
        required: [true, 'Product detailed description is required']
    },
    category_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'categories',
        required: [true, 'Product must belong to a category']
    },
    slug: {
        type: String,
        unique: true,
        required: true,
        trim: true,
        lowercase: true
    },
    status: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

// Custom validation for images array
productsSchema.path('images').validate(function(images) {
    if (!images || images.length === 0) {
        return true; // Allow empty images array
    }
    
    // Check that only one image is marked as primary
    const primaryImages = images.filter(img => img.isPrimary);
    if (primaryImages.length > 1) {
        return false;
    }
    
    // Check that order values are unique and sequential
    const orders = images.map(img => img.order).sort((a, b) => a - b);
    for (let i = 0; i < orders.length; i++) {
        if (orders[i] !== i) {
            return false;
        }
    }
    
    return true;
}, 'Images validation failed: Only one primary image allowed and orders must be sequential starting from 0');

// Pre-save middleware to ensure primary image logic
productsSchema.pre('save', function(next) {
    if (this.images && this.images.length > 0) {
        const primaryImages = this.images.filter(img => img.isPrimary);
        
        // If no primary image is set, make the first one primary
        if (primaryImages.length === 0) {
            this.images[0].isPrimary = true;
        }
        
        // Ensure orders are properly set
        this.images.forEach((img, index) => {
            if (img.order === undefined || img.order === null) {
                img.order = index;
            }
        });
        
        // Sort images by order
        this.images.sort((a, b) => a.order - b.order);
    }
    
    next();
});

// Enhanced slug generation with uniqueness check
productsSchema.pre('save', async function(next) {
    try {
        // Generate slug if not provided or name changed
        if (!this.slug || this.isModified('name')) {
            if (!this.name) {
                return next(new Error('Name is required to generate slug'));
            }
            
            let baseSlug = slugify(this.name, {
                lower: true,      // convert to lower case
                locale: 'vi',     // language code of the locale to use
                trim: true,       // trim leading and trailing replacement chars
                strict: true      // strip special characters except replacement
            });
            
            // Ensure slug uniqueness
            let slug = baseSlug;
            let counter = 1;
            let slugExists = true;
            
            while (slugExists) {
                const existingProduct = await this.constructor.findOne({ 
                    slug, 
                    _id: { $ne: this._id } 
                });
                
                if (!existingProduct) {
                    slugExists = false;
                } else {
                    slug = `${baseSlug}-${counter}`;
                    counter++;
                }
            }
            
            this.slug = slug;
        }
        
        next();
    } catch (error) {
        next(error);
    }
});

// Indexes for better query performance
productsSchema.index({ category_id: 1, status: 1 }); // For category filtering
productsSchema.index({ status: 1, createdAt: -1 }); // For status filtering and sorting
productsSchema.index({ slug: 1 }, { unique: true }); // For slug lookups

// Enhanced text search index with category population support
productsSchema.index({ 
    name: 'text', 
    description_sale: 'text'
}, {
    weights: {
        name: 10,
        description_sale: 5
    },
    name: 'product_search_index'
}); // For text search with enhanced weights

productsSchema.index({ price: 1 }); // For price sorting
productsSchema.index({ createdAt: -1 }); // For date sorting

const ProductsModel = mongoose.model('products',productsSchema);
module.exports = ProductsModel;