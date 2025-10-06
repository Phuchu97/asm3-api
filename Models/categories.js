const mongoose = require('mongoose');
const slugify = require('slugify');

const categoriesSchema = mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Category name is required'],
        unique: true,
        trim: true,
        minlength: [2, 'Category name must be at least 2 characters'],
        maxlength: [100, 'Category name must not exceed 100 characters']
    },
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
        default: 0,
        min: 0
    },
    slug: {
        type: String,
        unique: true,
        required: true,
        trim: true,
        lowercase: true
    }
}, { timestamps: true });

// Helper function to check circular references
async function checkCircularReference(categoryId, parentId, model) {
    if (!parentId) return false;
    if (categoryId && categoryId.toString() === parentId.toString()) return true;
    
    let currentParent = parentId;
    const visited = new Set();
    
    while (currentParent) {
        if (visited.has(currentParent.toString())) return true;
        if (categoryId && currentParent.toString() === categoryId.toString()) return true;
        
        visited.add(currentParent.toString());
        
        const parent = await model.findById(currentParent);
        if (!parent) break;
        
        currentParent = parent.parent_id;
    }
    
    return false;
}

// Enhanced slug generation with uniqueness check
categoriesSchema.pre('save', async function(next) {
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
                const existingCategory = await this.constructor.findOne({ 
                    slug, 
                    _id: { $ne: this._id } 
                });
                
                if (!existingCategory) {
                    slugExists = false;
                } else {
                    slug = `${baseSlug}-${counter}`;
                    counter++;
                }
            }
            
            this.slug = slug;
        }
        
        // Validate circular reference
        if (this.parent_id) {
            const hasCircularRef = await checkCircularReference(this._id, this.parent_id, this.constructor);
            if (hasCircularRef) {
                return next(new Error('Cannot set parent category - would create circular reference'));
            }
            
            // Validate parent exists
            const parent = await this.constructor.findById(this.parent_id);
            if (!parent) {
                return next(new Error('Parent category not found'));
            }
        }
        
        next();
    } catch (error) {
        next(error);
    }
});

// Validation to prevent self-reference
categoriesSchema.pre('save', function(next) {
    if (this.parent_id && this._id && this.parent_id.toString() === this._id.toString()) {
        return next(new Error('Category cannot be its own parent'));
    }
    next();
});

// Index for better query performance
categoriesSchema.index({ parent_id: 1, status: 1, order: 1 });
categoriesSchema.index({ slug: 1 }, { unique: true });
categoriesSchema.index({ name: 1 });

// Instance method to get all descendants
categoriesSchema.methods.getDescendants = async function() {
    const descendants = [];
    const queue = [this._id];
    
    while (queue.length > 0) {
        const currentId = queue.shift();
        const children = await this.constructor.find({ parent_id: currentId });
        
        for (const child of children) {
            descendants.push(child);
            queue.push(child._id);
        }
    }
    
    return descendants;
};

// Instance method to get full path
categoriesSchema.methods.getPath = async function() {
    const path = [this];
    let current = this;
    
    while (current.parent_id) {
        const parent = await this.constructor.findById(current.parent_id);
        if (!parent) break;
        path.unshift(parent);
        current = parent;
    }
    
    return path;
};

// Static method to build hierarchy tree
categoriesSchema.statics.buildHierarchy = async function(filter = {}) {
    const categories = await this.find({ ...filter, status: true }).sort({ order: 1, name: 1 });
    
    const categoryMap = {};
    const tree = [];
    
    // Create map for easy access
    categories.forEach(category => {
        categoryMap[category._id] = {
            ...category.toObject(),
            children: []
        };
    });
    
    // Build tree structure
    categories.forEach(category => {
        if (category.parent_id && categoryMap[category.parent_id]) {
            categoryMap[category.parent_id].children.push(categoryMap[category._id]);
        } else {
            tree.push(categoryMap[category._id]);
        }
    });
    
    return tree;
};

const CategoriesModel = mongoose.model('categories', categoriesSchema);
module.exports = CategoriesModel;