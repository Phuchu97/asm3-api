const mongoose = require('mongoose');
const slugify = require('slugify');

const BlogSchema = mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  slug: {
    type: String,
    required: true,
    unique: true,
  },
  content: {
    type: String,
    required: true,
  },
  summary: {
    type: String,
    required: false,
  },
  image: {
    type: String,
    required: false,
  },
  author: {
    type: String,
    default: 'Admin',
  },
  tags: {
    type: [String],
    default: [],
  },
  is_published: {
    type: Boolean,
    default: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  }
});

// Enhanced full text search index with proper weights
BlogSchema.index({ 
  title: 'text', 
  content: 'text', 
  summary: 'text',
  tags: 'text' 
}, {
  weights: {
    title: 10,
    summary: 5,
    tags: 3,
    content: 1
  },
  name: 'blog_search_index'
});

// Middleware để tự động cập nhật trường updated_at và tạo slug
BlogSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  
  // Tạo slug từ title nếu không có
  if (!this.slug && this.title) {
    this.slug = slugify(this.title, {
      lower: true,      // convert to lower case
      locale: 'vi',     // language code of the locale to use
      trim: true,       // trim leading and trailing replacement chars
      strict: true      // strip special characters except replacement
    });
  }
  
  next();
});

module.exports = mongoose.model('Blog', BlogSchema); 