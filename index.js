const express = require('express');
const app = express();
const dotenv = require('dotenv'); 
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./Models/User');
const mongoose = require('mongoose');
const multer = require('multer');
const slugify = require('slugify');
const ImageModel = require('./Models/image');
const CategoriesModel = require('./Models/categories');
const ProductsModel = require('./Models/products');
const CartModel = require('./Models/cart');
const OrderModel = require('./Models/order');
const SlideMiddleModel = require('./Models/slideMiddle');
const helpDelete = require('./util/delete');
const AuthLogin = require('./middleware/authLogin')
const bodyParser = require('body-parser');

const NodemailerContact = require('./Models/nodemailerContact');
const { catchDeleteFile } = require('./util/catchDeleteFile');
const { deleteFile } = require('./util/firebaseHandle');
const Blog = require('./Models/blog');
const path = require('path');

const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(process.cwd(), `.env.${env}`) });
console.log(`Running in ${process.env.NODE_ENV} mode`);
console.log(`PORT: ${process.env.PORT}`);
console.log(`Mongo URL: ${process.env.MONGOOSE_URL}`);
console.log(`JWTKEY: ${process.env.JWTKEY}`);


function authenticateToken(req, res, next) {  
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized: Token is required' });
  }

  jwt.verify(token, process.env.JWTKEY, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Forbidden: Invalid token' });
    }

    req.user = user;
    next();
  });
}

mongoose.connect(process.env.MONGOOSE_URL)
  .then(() => {
    // Database connected successfully
  })
  .catch((error) => {
    console.error('Database connection failed:', error);
  });

const Storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads')
  },
  filename: (req, file, cb) => {
    cb(null, new Date().toISOString().replace(/:/g, "-") + file.originalname)
  }
});

const filterImage = (req, file, cb) => {
  if (
    file.mimetype === 'image/png' ||
    file.mimetype === 'image/jpg' ||
    file.mimetype === 'image/jpeg'
  ) {
    cb(null, true);
  } else {
    cb(null, false);
  }
}

const upload = multer({ storage: Storage, fileFilter: filterImage });
const bcryptSalt = bcrypt.genSaltSync(10);

app.use(cors({
  origin: "*",
  credentials: true
}));
app.use(bodyParser.urlencoded({
  extended: true,
  limit: '100mb'
}));
app.use(express.json({ limit: '100mb' }));
app.use(express.static('uploads'));

app.get('/', (req, res, next) => {
  res.json({ message: 'API is running', statusCode: 200 });
})

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const checkUser = await User.findOne({ username });
  if (checkUser) {
    const passOk = bcrypt.compareSync(password, checkUser.password);
    if (passOk) {
      jwt.sign({ username: checkUser.username, id: checkUser._id }, process.env.JWTKEY, (err, token) => {
        if (err) throw err;
        res.cookie('token', token).json({ message: 'password ok', token: token, username: checkUser.username, userId: checkUser._id, role: checkUser.role, statusCode: 200 })
      })
    } else {
      res.status(422).json({ message: 'password not ok', statusCode: 500 })
    }
  } else {
    res.json('not found')
  }
})

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const userDoc = await User.create({
      username,
      password: bcrypt.hashSync(password, bcryptSalt),
      role: 'ADMIN'
    })
    res.json({ message: 'Register successfully!', data: userDoc, statusCode: 200 });
  }
  catch (e) {
    res.status(422).json(e)
  }
})



app.post('/add-slide', async (req, res, next) => {
  if (!req.body.file) {
    return res.status(422).json('File is empty')
  }
  try {
    const saveFile = await ImageModel.create({
      name: 'slide',
      image: req.body.file
    });
    res.json({ message: 'Save image successfully!', data: saveFile, statusCode: 200 });
  } catch {
    catchDeleteFile(req);
    res.status(422).json({ message: 'Save image failed!', statusCode: 500 })
  }
});


app.get('/get-slide', async (req, res, next) => {
  try {
    const getFiles = await ImageModel.find({ name: 'slide' });
    res.json({ message: 'Get image successfully!', data: getFiles, statusCode: 200 });
  } catch {
    res.status(422).json({ message: 'Get image failed!', statusCode: 500 })
  }
});

app.delete('/delete-slide', async (req, res, next) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(422).json({ message: 'Have no ID!', statusCode: 500 });
    await ImageModel.deleteOne({ _id: id });
    res.json({ message: 'Delete image successfully!', statusCode: 200 });
  } catch {
    res.status(422).json({ message: 'Delete image failed!', statusCode: 500 })
  }
});


// Helper function to check circular references
async function checkCircularReference(categoryId, parentId) {
  if (!parentId) return false;
  if (categoryId && categoryId.toString() === parentId.toString()) return true;
  
  let currentParent = parentId;
  const visited = new Set();
  
  while (currentParent) {
    if (visited.has(currentParent.toString())) return true;
    if (categoryId && currentParent.toString() === categoryId.toString()) return true;
    
    visited.add(currentParent.toString());
    
    const parent = await CategoriesModel.findById(currentParent);
    if (!parent) break;
    
    currentParent = parent.parent_id;
  }
  
  return false;
}

// Helper function to get category level (0 = root, 1 = level 1, 2 = level 2)
async function getCategoryLevel(categoryId) {
  if (!categoryId) return 0;
  
  let level = 0;
  let currentParent = categoryId;
  
  while (currentParent) {
    const category = await CategoriesModel.findById(currentParent);
    if (!category || !category.parent_id) break;
    
    level++;
    currentParent = category.parent_id;
  }
  
  return level;
}

// Helper function to validate category data
function validateCategoryData(data) {
  const errors = [];

  if (!data.name || data.name.trim().length < 2) {
    errors.push('Category name must be at least 2 characters');
  }

  if (data.name && data.name.trim().length > 100) {
    errors.push('Category name must not exceed 100 characters');
  }

  return errors;
}

// CATEGORIES
app.post('/add-category', async (req, res, next) => {
  try {
    // Validate input data
    const validationErrors = validateCategoryData(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        statusCode: 400,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Kiểm tra parent_id nếu có
    if (req.body.parent_id) {
      const parentCategory = await CategoriesModel.findById(req.body.parent_id);
      if (!parentCategory) {
        return res.status(400).json({
          statusCode: 400,
          message: 'Parent category not found'
        });
      }

      const parentLevel = await getCategoryLevel(req.body.parent_id);
      if (parentLevel >= 1) {
        return res.status(400).json({
          statusCode: 400,
          message: 'Không thể tạo danh mục cấp 3. Chỉ cho phép tạo danh mục tối đa cấp 2.'
        });
      }

      // Check for circular reference
      const hasCircularRef = await checkCircularReference(null, req.body.parent_id);
      if (hasCircularRef) {
        return res.status(400).json({
          statusCode: 400,
          message: 'Cannot set parent category - would create circular reference'
        });
      }
    }

    // Generate slug from name
    let slug = '';
    if (req.body.name) {
      slug = slugify(req.body.name, {
        lower: true,      // convert to lower case
        locale: 'vi',     // language code of the locale to use
        trim: true,       // trim leading and trailing replacement chars
        strict: true      // strip special characters except replacement
      });

      // Kiểm tra xem slug đã tồn tại chưa
      let slugExists = await CategoriesModel.findOne({ slug });
      let counter = 1;

      // Nếu slug đã tồn tại, thêm số vào cuối
      while (slugExists) {
        const newSlug = `${slug}-${counter}`;
        slugExists = await CategoriesModel.findOne({ slug: newSlug });
        if (!slugExists) {
          slug = newSlug;
        }
        counter++;
      }
    }

    const saveFile = await CategoriesModel.create({
      name: req.body.name.trim(),
      parent_id: req.body.parent_id || null,
      status: req.body.status !== undefined ? req.body.status : true,
      order: req.body.order || 0,
      slug
    });

    res.status(200).json({
      statusCode: 200,
      message: 'Category created successfully!',
      data: saveFile
    });
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({
      statusCode: 500,
      message: 'Internal server error',
      error: error.message
    });
  }
});




app.delete('/delete-category', async (req, res, next) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        statusCode: 400,
        message: 'Category ID is required'
      });
    }

    // Check if category exists
    const category = await CategoriesModel.findById(id);
    if (!category) {
      return res.status(404).json({
        statusCode: 404,
        message: 'Category not found'
      });
    }

    // Check if category has children
    const childCategories = await CategoriesModel.find({ parent_id: id });
    if (childCategories.length > 0) {
      return res.status(400).json({
        statusCode: 400,
        message: 'Cannot delete category with child categories. Please delete or reassign child categories first.',
        data: {
          childCount: childCategories.length,
          children: childCategories.map(child => ({ id: child._id, name: child.name }))
        }
      });
    }

    // Check if category has products
    const productsInCategory = await ProductsModel.countDocuments({ category_id: id });
    if (productsInCategory > 0) {
      return res.status(400).json({
        statusCode: 400,
        message: `Cannot delete category with ${productsInCategory} products. Please reassign products to another category first.`,
        data: {
          productCount: productsInCategory
        }
      });
    }

    await CategoriesModel.deleteOne({ _id: id });

    res.status(200).json({
      statusCode: 200,
      message: 'Category deleted successfully!'
    });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({
      statusCode: 500,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// API endpoint cập nhật danh mục
app.post('/edit-category', async (req, res, next) => {
  try {
    const { id, name, status, order, parent_id } = req.body;

    if (!id) {
      return res.status(400).json({
        statusCode: 400,
        message: 'Category ID is required'
      });
    }

    // Check if category exists
    const existingCategory = await CategoriesModel.findById(id);
    if (!existingCategory) {
      return res.status(404).json({
        statusCode: 404,
        message: 'Category not found'
      });
    }

    // Validate input data
    const validationErrors = validateCategoryData(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        statusCode: 400,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    const updateData = {
      name: name.trim(),
      status: status !== undefined ? status : true,
      order: order || 0,
      parent_id: parent_id || null
    };

    // Kiểm tra parent_id nếu có
    if (parent_id) {
      const parentCategory = await CategoriesModel.findById(parent_id);
      if (!parentCategory) {
        return res.status(400).json({
          statusCode: 400,
          message: 'Parent category not found'
        });
      }

      // Check for circular reference
      const hasCircularRef = await checkCircularReference(id, parent_id);
      if (hasCircularRef) {
        return res.status(400).json({
          statusCode: 400,
          message: 'Cannot set parent category - would create circular reference'
        });
      }
    }

    // Cập nhật slug nếu có thay đổi tên
    if (name && name !== existingCategory.name) {
      let slug = slugify(name, {
        lower: true,      // convert to lower case
        locale: 'vi',     // language code of the locale to use
        trim: true,       // trim leading and trailing replacement chars
        strict: true      // strip special characters except replacement
      });

      // Kiểm tra xem slug đã tồn tại chưa (exclude current category)
      let slugExists = await CategoriesModel.findOne({ slug, _id: { $ne: id } });
      let counter = 1;

      // Nếu slug đã tồn tại, thêm số vào cuối
      while (slugExists) {
        const newSlug = `${slug}-${counter}`;
        slugExists = await CategoriesModel.findOne({ slug: newSlug, _id: { $ne: id } });
        if (!slugExists) {
          slug = newSlug;
        }
        counter++;
      }

      updateData.slug = slug;
    }

    const result = await CategoriesModel.updateOne(
      { _id: id },
      updateData
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        statusCode: 404,
        message: 'Category not found'
      });
    }

    const updatedCategory = await CategoriesModel.findById(id);

    res.status(200).json({
      statusCode: 200,
      message: 'Category updated successfully!',
      data: updatedCategory
    });
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({
      statusCode: 500,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// PRODUCTS
app.post('/add-product', async (req, res, next) => {
  try {
    // Validate required fields
    if (!req.body.name || !req.body.price || !req.body.category_id) {
      return res.status(400).json({
        message: 'Missing required fields: name, price, category_id',
        statusCode: 400
      });
    }

    // Validate and process images
    let processedImages = [];
    if (req.body.images && req.body.images.length > 0) {
      processedImages = req.body.images.map((image, index) => ({
        url: image.url,
        isPrimary: image.isPrimary !== undefined ? image.isPrimary : (index === 0), // Properly handle boolean false
        order: image.order !== undefined ? image.order : index,
        metadata: image.metadata || {
          size: 0,
          dimensions: { width: 0, height: 0 },
          format: 'unknown'
        }
      }));

      // Ensure only one primary image
      const primaryCount = processedImages.filter(img => img.isPrimary).length;
      if (primaryCount === 0) {
        // No primary image, set first as primary
        processedImages[0].isPrimary = true;
      } else if (primaryCount > 1) {
        // Multiple primary images, keep only the first one
        let foundPrimary = false;
        processedImages = processedImages.map(img => {
          if (img.isPrimary && !foundPrimary) {
            foundPrimary = true;
            return img;
          }
          return { ...img, isPrimary: false };
        });
      }


    }

    // Generate slug from product name if not provided
    let slug = req.body.slug;
    if (!slug && req.body.name) {
      slug = slugify(req.body.name, {
        lower: true,
        locale: 'vi',
        trim: true,
        strict: true
      });

      // Check for slug uniqueness
      let slugExists = await ProductsModel.findOne({ slug });
      let counter = 1;

      while (slugExists) {
        const newSlug = `${slug}-${counter}`;
        slugExists = await ProductsModel.findOne({ slug: newSlug });
        if (!slugExists) {
          slug = newSlug;
        }
        counter++;
      }
    }



    const productData = {
      name: req.body.name.trim(),
      price: parseFloat(req.body.price),
      category_id: req.body.category_id,
      description_sale: req.body.description_sale || '',
      description_detail: req.body.description_detail || '',
      images: processedImages,
      slug,
      status: req.body.status !== undefined ? req.body.status : true
    };

    const saveFile = await ProductsModel.create(productData);

    res.status(200).json({
      message: 'Save product successfully!',
      data: saveFile,
      statusCode: 200
    });
  } catch (error) {
    console.error('Error creating product:', error);
    catchDeleteFile(req);
    res.status(500).json({
      message: 'Save product failed!',
      error: error.message,
      statusCode: 500
    });
  }
});

app.post('/edit-product', async (req, res, next) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        message: 'Product ID is required',
        statusCode: 400
      });
    }

    // Check if product exists
    const existingProduct = await ProductsModel.findById(id);
    if (!existingProduct) {
      return res.status(404).json({
        message: 'Product not found',
        statusCode: 404
      });
    }

    // Validate required fields
    if (!req.body.name || !req.body.price || !req.body.category_id) {
      return res.status(400).json({
        message: 'Missing required fields: name, price, category_id',
        statusCode: 400
      });
    }

    // Process images if provided
    let processedImages = existingProduct.images; // Keep existing images by default

    if (req.body.images && req.body.images.length > 0) {
      // New images provided, replace existing ones
      processedImages = req.body.images.map((image, index) => ({
        url: image.url,
        isPrimary: image.isPrimary !== undefined ? image.isPrimary : (index === 0), // Properly handle boolean false
        order: image.order !== undefined ? image.order : index,
        metadata: image.metadata || {
          size: 0,
          dimensions: { width: 0, height: 0 },
          format: 'unknown'
        }
      }));

      // Ensure only one primary image
      const primaryCount = processedImages.filter(img => img.isPrimary).length;
      if (primaryCount === 0) {
        // No primary image, set first as primary
        processedImages[0].isPrimary = true;
      } else if (primaryCount > 1) {
        // Multiple primary images, keep only the first one
        let foundPrimary = false;
        processedImages = processedImages.map(img => {
          if (img.isPrimary && !foundPrimary) {
            foundPrimary = true;
            return img;
          }
          return { ...img, isPrimary: false };
        });
      }
    }

    // Generate new slug if name changed
    let slug = existingProduct.slug;
    if (req.body.name && req.body.name !== existingProduct.name) {
      slug = slugify(req.body.name, {
        lower: true,
        locale: 'vi',
        trim: true,
        strict: true
      });

      // Check for slug uniqueness (exclude current product)
      let slugExists = await ProductsModel.findOne({ slug, _id: { $ne: id } });
      let counter = 1;

      while (slugExists) {
        const newSlug = `${slug}-${counter}`;
        slugExists = await ProductsModel.findOne({ slug: newSlug, _id: { $ne: id } });
        if (!slugExists) {
          slug = newSlug;
        }
        counter++;
      }
    }

    const updateData = {
      name: req.body.name.trim(),
      price: parseFloat(req.body.price),
      category_id: req.body.category_id,
      description_sale: req.body.description_sale || '',
      description_detail: req.body.description_detail || '',
      images: processedImages,
      slug,
      status: req.body.status !== undefined ? req.body.status : existingProduct.status
    };

    const result = await ProductsModel.updateOne({ _id: id }, updateData);

    if (result.matchedCount === 0) {
      return res.status(404).json({
        message: 'Product not found',
        statusCode: 404
      });
    }

    const updatedProduct = await ProductsModel.findById(id);

    res.status(200).json({
      message: 'Edit product successfully!',
      data: updatedProduct,
      statusCode: 200
    });
  } catch (error) {
    console.error('Error updating product:', error);
    catchDeleteFile(req);
    res.status(500).json({
      message: 'Edit product failed!',
      error: error.message,
      statusCode: 500
    });
  }
});

app.get('/get-products', async (req, res, next) => {
  try {
    // Check if this is a request from FE-NEW (frontend) or admin
    const isAdminRequest = req.headers['x-admin-request'] === 'true' ||
      req.headers['authorization'] ||
      req.query.admin === 'true';

    let query = {};

    // For FE-NEW, only return active products
    if (!isAdminRequest) {
      query.status = true;
    }

    const getProducts = await ProductsModel.find(query)
      .populate('category_id', 'name slug')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      message: 'Get products successfully!',
      data: getProducts,
      statusCode: 200
    });
  } catch (error) {
    console.error('Error getting products:', error);
    res.status(500).json({
      message: 'Get products failed!',
      error: error.message,
      statusCode: 500
    });
  }
});

app.get('/get-product/:id', async (req, res, next) => {
  console.log('Get product request received:', req.params.id);
  try {
    const id = req.params.id;
    let product;

    // Check if this is a request from admin
    const isAdminRequest = req.headers['x-admin-request'] === 'true' ||
      req.headers['authorization'] ||
      req.query.admin === 'true';

    let query = {};

    // For FE-NEW, only return active products
    if (!isAdminRequest) {
      query.status = true;
    }

    // Try to find by ID first
    if (mongoose.Types.ObjectId.isValid(id)) {
      product = await ProductsModel.findOne({ _id: id, ...query })
        .populate('category_id', 'name slug')
        .lean();
    }

    // If not found by ID, try to find by slug
    if (!product) {
      product = await ProductsModel.findOne({ slug: id, ...query })
        .populate('category_id', 'name slug')
        .lean();
    }

    if (!product) {
      return res.status(404).json({
        message: 'Không tìm thấy sản phẩm',
        statusCode: 404
      });
    }

    res.status(200).json({
      message: 'Lấy thông tin sản phẩm thành công',
      data: product,
      statusCode: 200
    });
  } catch (error) {
    console.error('Lỗi khi lấy sản phẩm:', error);
    res.status(500).json({
      message: 'Lỗi khi lấy thông tin sản phẩm',
      error: error.message,
      statusCode: 500
    });
  }
});

app.post('/get-product-detail', async (req, res, next) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        message: 'Product ID is required',
        statusCode: 400
      });
    }

    const getProductDetail = await ProductsModel.findOne({ _id: id })
      .populate('category_id', 'name slug')
      .lean();

    if (!getProductDetail) {
      return res.status(404).json({
        message: 'Product not found',
        statusCode: 404
      });
    }

    res.status(200).json({
      message: 'Get product successfully!',
      data: getProductDetail,
      statusCode: 200
    });
  } catch (error) {
    console.error('Error getting product detail:', error);
    res.status(500).json({
      message: 'Get product failed!',
      error: error.message,
      statusCode: 500
    });
  }
});

app.post('/related-products', async (req, res, next) => {
  try {
    const { productId, limit = 8, includeHierarchy = true } = req.body;

    // Validation
    if (!productId) {
      return res.status(400).json({
        statusCode: 400,
        message: 'Product ID is required',
        data: null
      });
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        statusCode: 400,
        message: 'Invalid product ID format',
        data: null
      });
    }

    // Get current product and its category with optimized query
    const currentProduct = await ProductsModel.findById(productId)
      .populate('category_id', 'name parent_id slug')
      .select('_id name category_id')
      .lean();

    if (!currentProduct) {
      return res.status(404).json({
        statusCode: 404,
        message: 'Product not found',
        data: null
      });
    }

    const categoryId = currentProduct.category_id._id;
    let relatedProducts = [];
    let searchStrategy = 'exact_category';

    // Optimized query for products from same category (excluding current product)
    // Using compound index hint for better performance
    relatedProducts = await ProductsModel.find({
      category_id: categoryId,
      _id: { $ne: productId },
      status: true
    })
      .populate('category_id', 'name slug')
      .select('_id name price images category_id slug createdAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .hint({ category_id: 1, status: 1 })
      .lean();

    // If not enough products and hierarchy is enabled, expand search
    if (relatedProducts.length < limit && includeHierarchy) {
      const remainingLimit = limit - relatedProducts.length;
      const excludeIds = [productId, ...relatedProducts.map(p => p._id)];

      // Try parent category with optimized query
      if (currentProduct.category_id.parent_id) {
        const parentProducts = await ProductsModel.find({
          category_id: currentProduct.category_id.parent_id,
          _id: { $nin: excludeIds },
          status: true
        })
          .populate('category_id', 'name slug')
          .select('_id name price images category_id slug createdAt')
          .sort({ createdAt: -1 })
          .limit(remainingLimit)
          .lean();

        relatedProducts = [...relatedProducts, ...parentProducts];
        if (parentProducts.length > 0) searchStrategy = 'parent_category';
      }

      // Try sibling categories if still not enough - optimized with single query
      if (relatedProducts.length < limit && currentProduct.category_id.parent_id) {
        const siblingProducts = await ProductsModel.find({
          category_id: { $ne: categoryId },
          _id: { $nin: [...excludeIds, ...relatedProducts.map(p => p._id)] },
          status: true
        })
          .populate({
            path: 'category_id',
            match: {
              parent_id: currentProduct.category_id.parent_id,
              status: true
            },
            select: 'name slug parent_id'
          })
          .select('_id name price images category_id slug createdAt')
          .sort({ createdAt: -1 })
          .limit(limit - relatedProducts.length)
          .lean();

        // Filter out products where category_id is null (didn't match populate condition)
        const validSiblingProducts = siblingProducts.filter(p => p.category_id);
        relatedProducts = [...relatedProducts, ...validSiblingProducts];
        if (validSiblingProducts.length > 0) searchStrategy = 'sibling_categories';
      }

      // Try child categories if still not enough - optimized with single query
      if (relatedProducts.length < limit) {
        const childProducts = await ProductsModel.find({
          _id: { $nin: [...excludeIds, ...relatedProducts.map(p => p._id)] },
          status: true
        })
          .populate({
            path: 'category_id',
            match: {
              parent_id: categoryId,
              status: true
            },
            select: 'name slug parent_id'
          })
          .select('_id name price images category_id slug createdAt')
          .sort({ createdAt: -1 })
          .limit(limit - relatedProducts.length)
          .lean();

        // Filter out products where category_id is null (didn't match populate condition)
        const validChildProducts = childProducts.filter(p => p.category_id);
        relatedProducts = [...relatedProducts, ...validChildProducts];
        if (validChildProducts.length > 0) searchStrategy = 'child_categories';
      }
    }

    const result = {
      products: relatedProducts.slice(0, limit),
      metadata: {
        currentProduct: {
          id: currentProduct._id,
          categoryId: currentProduct.category_id._id,
          categoryName: currentProduct.category_id.name,
          parentCategoryId: currentProduct.category_id.parent_id || null
        },
        searchStrategy,
        totalFound: relatedProducts.length,
        requestedLimit: limit,
        hierarchyEnabled: includeHierarchy,
        searchLevels: {
          sameCategory: relatedProducts.filter(p => p.category_id._id.toString() === categoryId.toString()).length,
          parentCategory: currentProduct.category_id.parent_id ? relatedProducts.filter(p => p.category_id._id.toString() === currentProduct.category_id.parent_id.toString()).length : 0,
          siblingCategories: currentProduct.category_id.parent_id ? relatedProducts.filter(p =>
            p.category_id._id.toString() !== categoryId.toString() &&
            p.category_id.parent_id &&
            p.category_id.parent_id.toString() === currentProduct.category_id.parent_id.toString()
          ).length : 0,
          childCategories: relatedProducts.filter(p =>
            p.category_id.parent_id &&
            p.category_id.parent_id.toString() === categoryId.toString()
          ).length
        }
      }
    };

    res.status(200).json({
      statusCode: 200,
      message: 'Get related products successfully!',
      data: result
    });
  } catch (error) {
    console.error('Error in /related-products:', error);

    // Handle specific error types
    if (error.name === 'CastError' && error.kind === 'ObjectId') {
      return res.status(400).json({
        statusCode: 400,
        message: 'Invalid product ID format',
        error: 'INVALID_PRODUCT_ID',
        data: null
      });
    }

    if (error.message === 'Product not found') {
      return res.status(404).json({
        statusCode: 404,
        message: 'Product not found',
        error: 'PRODUCT_NOT_FOUND',
        data: null
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        statusCode: 400,
        message: 'Validation error',
        error: 'VALIDATION_ERROR',
        details: error.message,
        data: null
      });
    }

    if (error.name === 'MongoError' || error.name === 'MongoServerError') {
      return res.status(503).json({
        statusCode: 503,
        message: 'Database service unavailable',
        error: 'DATABASE_ERROR',
        data: null
      });
    }

    // Generic server error
    res.status(500).json({
      statusCode: 500,
      message: 'Internal server error',
      error: 'INTERNAL_SERVER_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      data: null
    });
  }
});

// Optimized helper function to get all descendant category IDs using aggregation
async function getAllDescendantCategoryIds(categoryId) {
  try {
    // Use MongoDB aggregation with $graphLookup for better performance
    const result = await CategoriesModel.aggregate([
      {
        $match: { _id: new mongoose.Types.ObjectId(categoryId), status: true }
      },
      {
        $graphLookup: {
          from: 'categories',
          startWith: '$_id',
          connectFromField: '_id',
          connectToField: 'parent_id',
          as: 'descendants',
          restrictSearchWithMatch: { status: true }
        }
      },
      {
        $project: {
          allIds: {
            $concatArrays: [
              ['$_id'],
              '$descendants._id'
            ]
          }
        }
      }
    ]);

    if (result.length > 0) {
      return result[0].allIds;
    }

    // Fallback to original category ID if no results
    return [new mongoose.Types.ObjectId(categoryId)];
  } catch (error) {
    console.error('Error in getAllDescendantCategoryIds:', error);
    // Fallback to original category ID on error
    return [new mongoose.Types.ObjectId(categoryId)];
  }
}

// API lọc sản phẩm theo danh mục và sắp xếp với hierarchy logic
app.post('/filter-products', async (req, res, next) => {
  try {
    const {
      categoryId,
      sortBy,
      sortOrder,
      page = 1,
      limit = 12,
      keyword
    } = req.body;

    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit))); // Max 100 items per page

    // Xây dựng query filter
    let query = {
      status: true, // Only show active products
      deleted: { $ne: true },
      _deleted: { $ne: true }
    };

    // Lọc theo danh mục nếu có (với full hierarchy support)
    if (categoryId) {
      try {
        // Validate categoryId format
        if (!mongoose.Types.ObjectId.isValid(categoryId)) {
          return res.status(400).json({
            statusCode: 400,
            message: 'Invalid category ID format',
            data: null
          });
        }

        // Get all descendant category IDs (including the category itself)
        const categoryIds = await getAllDescendantCategoryIds(categoryId);

        if (categoryIds.length > 0) {
          query.category_id = { $in: categoryIds };
        }
      } catch (categoryError) {
        console.error('Error getting category hierarchy:', categoryError);
        // Fallback to just the provided category ID as ObjectId
        query.category_id = new mongoose.Types.ObjectId(categoryId);
      }
    }

    // Enhanced keyword search with text search index
    if (keyword && keyword.trim()) {
      const keywordTrimmed = keyword.trim();

      // Use regex search for better compatibility
      const keywordRegex = new RegExp(keywordTrimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { name: keywordRegex },
        { description_sale: keywordRegex }
      ];
    }

    // Xây dựng options sắp xếp
    let sort = {};

    if (sortBy && sortOrder) {
      const validSortFields = ['price', 'name', 'createdAt', 'order'];
      const validSortOrders = ['asc', 'desc'];

      if (validSortFields.includes(sortBy) && validSortOrders.includes(sortOrder)) {
        if (sortBy === 'price') {
          sort.price = sortOrder === 'asc' ? 1 : -1;
        } else if (sortBy === 'name') {
          sort.name = sortOrder === 'asc' ? 1 : -1;
        } else if (sortBy === 'createdAt') {
          sort.createdAt = sortOrder === 'desc' ? -1 : 1;
        } else if (sortBy === 'order') {
          sort.order = sortOrder === 'asc' ? 1 : -1;
        }
      }
    }

    // Default sort if no valid sort specified
    if (Object.keys(sort).length === 0) {
      sort = { createdAt: -1 }; // Newest first (removed featured sorting)
    }

    // Tính toán skip cho phân trang
    const skip = (pageNum - 1) * limitNum;

    // Thực hiện truy vấn với populate category information
    const products = await ProductsModel.find(query)
      .populate('category_id', 'name slug')
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean(); // Use lean for better performance

    // Đếm tổng số sản phẩm phù hợp với query
    const total = await ProductsModel.countDocuments(query);

    res.status(200).json({
      statusCode: 200,
      message: 'Filter products successfully!',
      data: {
        products,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
          hasNextPage: pageNum < Math.ceil(total / limitNum),
          hasPrevPage: pageNum > 1
        },
        filters: {
          categoryId: categoryId || null,
          keyword: keyword || null,
          sortBy: sortBy || 'createdAt',
          sortOrder: sortOrder || 'desc'
        }
      }
    });
  } catch (error) {
    console.error('Error filtering products:', error);
    res.status(500).json({
      statusCode: 500,
      message: 'Internal server error',
      error: error.message
    });
  }
});

app.delete('/delete-product', async (req, res, next) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        message: 'Product ID is required',
        statusCode: 400
      });
    }

    const getProduct = await ProductsModel.findById(id);

    if (!getProduct) {
      return res.status(404).json({
        message: 'Product not found',
        statusCode: 404
      });
    }

    // Delete images from Firebase storage if they exist
    if (getProduct.images && getProduct.images.length > 0) {
      getProduct.images.forEach(item => {
        if (item.url) {
          try {
            deleteFile(item.url);
          } catch (deleteError) {
            console.error('Error deleting image:', deleteError);
          }
        }
      });
    }

    await ProductsModel.deleteOne({ _id: id });

    res.status(200).json({
      message: 'Delete product successfully!',
      statusCode: 200
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({
      message: 'Delete product failed!',
      error: error.message,
      statusCode: 500
    });
  }
});


// CART

app.post('/add-cart', async (req, res, next) => {
  try {
    const saveFile = await CartModel.create({
      name_product: req.body.name_product,
      product_id: req.body.product_id,
      category_product_name: req.body.category_product_name,
      category_id: req.body.category_id,
      price_product: req.body.price_product,
      quantity: req.body.quantity,
      image: req.body.file_image,
      user_id: req.body.user_id,
    });
    res.json({ message: 'Save cart successfully!', data: saveFile, statusCode: 200 });
  } catch {
    res.status(422).json({ message: 'Save cart failed!', statusCode: 500 })
  }
});

app.post('/get-list-cart', async (req, res, next) => {
  try {
    const { id } = req.body;
    const listCart = await CartModel.find({ user_id: id });
    res.json({ message: 'Get list cart successfully!', data: listCart, statusCode: 200 });
  } catch {
    res.status(422).json({ message: 'Get list cart failed!', statusCode: 500 })
  }
});

app.delete('/delete-cart-item', async (req, res, next) => {
  try {
    const { id } = req.body;
    await CartModel.deleteOne({ _id: id });
    res.json({ message: 'Delete order successfully!', statusCode: 200 });
  } catch {
    res.status(422).json({ message: 'Delete order failed!', statusCode: 500 });
  }
});


// ORDER
app.post('/add-order', AuthLogin.authLoginNoRole(), async (req, res, next) => {
  try {
    let data = {
      list_cart: req.body.list_cart,
      total: req.body.total,
      name_order: req.body.name_order,
      phone: req.body.phone,
      address: req.body.address,
      email: req.body.email,
    }
    const saveFile = await OrderModel.create({
      list_cart: req.body.list_cart,
      user_id: req.body.user_id,
      total: req.body.total,
      name_order: req.body.name_order,
      phone: req.body.phone,
      address: req.body.address,
      email: req.body.email,
      delivery: 0,
      status: 0
    });
    EmailModel.api.emailsPost(EmailModel.email(data), (error, data, response) => {
      if (error) {
        console.error(error);
      }
    });
    await CartModel.deleteMany({ user_id: req.body.user_id });
    res.json({ message: 'Create order successfully!', data: saveFile, statusCode: 200 });
  } catch {
    res.status(422).json({ message: 'Create order failed!', statusCode: 500 })
  }
});

app.post('/get-list-order', AuthLogin.authLoginNoRole(), async (req, res, next) => {
  try {
    const { id } = req.body;
    const listCart = await OrderModel.find({ user_id: id });
    res.json({ message: 'Get list cart successfully!', data: listCart, statusCode: 200 });
  } catch {
    res.status(422).json({ message: 'Get list cart failed!', statusCode: 500 })
  }
});

app.post('/get-list-cart-order', AuthLogin.authLoginNoRole(), async (req, res, next) => {
  try {
    const { id } = req.body;
    const listCart = await OrderModel.find({ _id: id });
    res.json({ message: 'Get list cart successfully!', data: listCart, statusCode: 200 });
  } catch {
    res.status(422).json({ message: 'Get list cart failed!', statusCode: 500 })
  }
});

// Contact form endpoint
app.post('/send-contact', async (req, res, next) => {
  try {
    const { name, email, phone, company, subject, message } = req.body;

    // Validate required fields
    if (!name || !email || !phone || !subject || !message) {
      return res.status(400).json({
        message: 'Vui lòng điền đầy đủ thông tin bắt buộc!',
        statusCode: 400
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        message: 'Email không hợp lệ!',
        statusCode: 400
      });
    }

    // Validate phone format (Vietnamese phone number)
    const phoneRegex = /^[0-9]{10,11}$/;
    if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
      return res.status(400).json({
        message: 'Số điện thoại không hợp lệ!',
        statusCode: 400
      });
    }

    const contactData = {
      name,
      email,
      phone,
      company: company || '',
      subject,
      message
    };

    // Send email using Nodemailer (mock version for testing)
    try {
      const result = await NodemailerContact.sendContactEmail(contactData);
      
      res.json({
        message: 'Gửi liên hệ thành công! Chúng tôi sẽ phản hồi trong thời gian sớm nhất.',
        statusCode: 200
      });
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      return res.status(500).json({
        message: 'Có lỗi xảy ra khi gửi email. Vui lòng thử lại sau!',
        statusCode: 500
      });
    }

  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({
      message: 'Có lỗi xảy ra. Vui lòng thử lại sau!',
      statusCode: 500
    });
  }
});

// slide middle

app.post('/add-slide-middle', async (req, res, next) => {
  if (!req.body.files || req.body.files.length === 0) {
    return res.status(422).json({ message: 'File is empty,save product failed!', statusCode: 422 })
  }
  try {
    const saveFile = await SlideMiddleModel.updateOne({ _id: req.body.id }, {
      name: req.body.name,
      description: req.body.description,
      image: req.body.files
    });
    res.json({ message: 'Save slide middle successfully!', data: saveFile, statusCode: 200 });
  } catch {
    catchDeleteFile(req);
    res.status(422).json({ message: 'Save Slide Middle failed!', statusCode: 500 })
  }
});

app.get('/get-slide-middle', async (req, res, next) => {
  try {
    const getSlideMiddle = await SlideMiddleModel.find({});
    res.json({ message: 'Get Slide Middle successfully!', data: getSlideMiddle, statusCode: 200 });
  } catch {
    res.status(422).json({ message: 'Save Slide Middle failed!', statusCode: 500 })
  }
});

// Endpoint để cập nhật slug cho tất cả sản phẩm đã có
app.get('/update-product-slugs', async (req, res) => {
  try {
    const products = await ProductsModel.find({ slug: { $exists: false } });

    let updatedCount = 0;
    for (const product of products) {
      if (!product.slug && product.name) {
        // Tạo slug từ tên sản phẩm
        let slug = slugify(product.name, {
          lower: true,      // convert to lower case
          locale: 'vi',     // language code of the locale to use
          trim: true,       // trim leading and trailing replacement chars
          strict: true      // strip special characters except replacement
        });

        // Kiểm tra xem slug đã tồn tại chưa
        let slugExists = await ProductsModel.findOne({ slug });
        let counter = 1;

        // Nếu slug đã tồn tại, thêm số vào cuối
        while (slugExists) {
          const newSlug = `${slug}-${counter}`;
          slugExists = await ProductsModel.findOne({ slug: newSlug });
          if (!slugExists) {
            slug = newSlug;
          }
          counter++;
        }

        // Cập nhật sản phẩm với slug mới
        await ProductsModel.updateOne(
          { _id: product._id },
          { $set: { slug } }
        );

        updatedCount++;
      }
    }

    res.json({
      message: `Đã cập nhật slug cho ${updatedCount} sản phẩm`,
      statusCode: 200
    });
  } catch (error) {
    console.error('Lỗi khi cập nhật slug:', error);
    res.status(500).json({
      message: 'Lỗi khi cập nhật slug',
      statusCode: 500
    });
  }
});

// API endpoint cho client
// Lưu ý: Đặt endpoint cụ thể trước endpoint có tham số
app.get('/api/blogs/tags', async (req, res) => {
  try {
    // Lấy tất cả tags được sử dụng
    const tags = await Blog.aggregate([
      { $match: { is_published: true } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      data: tags.map(tag => ({
        name: tag._id,
        count: tag.count
      }))
    });
  } catch (error) {
    console.error('Error fetching blog tags:', error);
    res.status(500).json({ message: 'Error fetching blog tags', error: error.message });
  }
});

app.get('/api/blogs', async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', tag = '', sortBy = 'created_at', order = 'desc' } = req.query;

    // Xây dựng query filter
    let filter = { is_published: true };

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    if (tag) {
      filter.tags = tag;
    }

    // Tính pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Xây dựng sort options
    const sortOptions = {};
    sortOptions[sortBy] = order === 'asc' ? 1 : -1;

    // Thực hiện query
    const blogs = await Blog.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));



    // Đếm tổng số bài viết phù hợp với filter
    const totalBlogs = await Blog.countDocuments(filter);

    res.json({
      data: blogs,
      meta: {
        total: totalBlogs,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalBlogs / parseInt(limit)),
      }
    });
  } catch (error) {
    console.error('Error fetching blogs:', error);
    res.status(500).json({ message: 'Error fetching blogs', error: error.message });
  }
});

// Enhanced related posts endpoint with multiple tags support and relevance scoring
app.get('/api/blogs/:slug/related', async (req, res) => {
  try {
    const { limit = 6, strategy = 'auto' } = req.query;
    const currentSlug = req.params.slug;

    // Get current blog post
    const currentBlog = await Blog.findOne({ slug: currentSlug, is_published: true });
    if (!currentBlog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    let relatedPosts = [];
    let usedStrategy = 'recent';
    const startTime = Date.now();

    // Try tags-based strategy if current blog has tags
    if (strategy !== 'recent' && currentBlog.tags && currentBlog.tags.length > 0) {
      try {
        // Use MongoDB aggregation for better performance and relevance scoring
        const tagBasedPosts = await Blog.aggregate([
          // Match published posts excluding current post
          {
            $match: {
              is_published: true,
              _id: { $ne: currentBlog._id },
              tags: { $in: currentBlog.tags }
            }
          },
          // Add relevance score field
          {
            $addFields: {
              relevanceScore: {
                $let: {
                  vars: {
                    matchingTags: {
                      $size: {
                        $setIntersection: ['$tags', currentBlog.tags]
                      }
                    },
                    currentTagsCount: currentBlog.tags.length,
                    postTagsCount: { $size: '$tags' }
                  },
                  in: {
                    $add: [
                      // Match ratio (70% weight)
                      {
                        $multiply: [
                          { $divide: ['$$matchingTags', '$$currentTagsCount'] },
                          0.7
                        ]
                      },
                      // Coverage ratio (30% weight)
                      {
                        $multiply: [
                          { $divide: ['$$matchingTags', '$$postTagsCount'] },
                          0.3
                        ]
                      }
                    ]
                  }
                }
              },
              matchingTags: {
                $setIntersection: ['$tags', currentBlog.tags]
              }
            }
          },
          // Sort by relevance score (desc) then by created_at (desc)
          {
            $sort: {
              relevanceScore: -1,
              created_at: -1
            }
          },
          // Limit results
          {
            $limit: parseInt(limit)
          },
          // Project only needed fields for performance
          {
            $project: {
              title: 1,
              slug: 1,
              summary: 1,
              image: 1,
              author: 1,
              tags: 1,
              created_at: 1,
              relevanceScore: 1,
              matchingTags: 1
            }
          }
        ]);

        if (tagBasedPosts.length > 0) {
          relatedPosts = tagBasedPosts;
          usedStrategy = 'tags';
        }
      } catch (tagError) {
        console.error('Error in tags-based related posts query:', tagError);
        // Continue to fallback strategy
      }
    }

    // Fallback to recent posts if no tag-based results
    if (relatedPosts.length === 0) {
      relatedPosts = await Blog.find({
        is_published: true,
        _id: { $ne: currentBlog._id }
      })
        .select('title slug summary image author tags created_at')
        .sort({ created_at: -1 })
        .limit(parseInt(limit));

      usedStrategy = 'recent';
    }

    const queryTime = Date.now() - startTime;

    // Add metadata for debugging and analytics
    const metadata = {
      currentPost: {
        id: currentBlog._id,
        title: currentBlog.title,
        tags: currentBlog.tags
      },
      strategy: usedStrategy,
      totalFound: relatedPosts.length,
      requestedLimit: parseInt(limit),
      queryTime: `${queryTime}ms`,
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      data: relatedPosts,
      metadata
    });

  } catch (error) {
    console.error('Error fetching related posts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching related posts',
      error: error.message
    });
  }
});

app.get('/api/blogs/:slug', async (req, res) => {
  try {
    const blog = await Blog.findOne({ slug: req.params.slug });
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }
    res.json({ data: blog });
  } catch (error) {
    console.error('Error fetching blog:', error);
    res.status(500).json({ message: 'Error fetching blog', error: error.message });
  }
});

// Admin-only endpoints (tạm thời bỏ middleware xác thực)
app.post('/admin/blogs', async (req, res) => {
  try {
    const { title, content, summary, image, tags, is_published } = req.body;

    // Generate slug from title
    const slug = slugify(title, {
      lower: true,      // convert to lower case
      locale: 'vi',     // language code of the locale to use
      trim: true,       // trim leading and trailing replacement chars
      strict: true      // strip special characters except replacement
    })

    const newBlog = new Blog({
      title,
      slug,
      content,
      summary,
      image,
      tags: tags || [],
      is_published: is_published !== undefined ? is_published : true,
      author: 'Admin', // Tạm thời hardcode author
    });

    const savedBlog = await newBlog.save();

    res.status(201).json({ message: 'Blog created successfully', data: savedBlog });
  } catch (error) {
    console.error('Error creating blog:', error);
    res.status(500).json({ message: 'Error creating blog', error: error.message });
  }
});

app.put('/admin/blogs/:id', async (req, res) => {
  try {
    const { title, content, summary, image, tags, is_published } = req.body;

    const updateData = {
      title,
      content,
      summary,
      tags,
      is_published,
      updated_at: new Date(),
    };

    // Thêm image vào updateData nếu có
    if (image) {
      updateData.image = image;
    }

    // Generate slug mới nếu thay đổi title
    if (title) {
      updateData.slug = slugify(title, {
        lower: true,      // convert to lower case
        locale: 'vi',     // language code of the locale to use
        trim: true,       // trim leading and trailing replacement chars
        strict: true      // strip special characters except replacement
      })
    }

    const updatedBlog = await Blog.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    );

    if (!updatedBlog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    res.json({ message: 'Blog updated successfully', data: updatedBlog });
  } catch (error) {
    console.error('Error updating blog:', error);
    res.status(500).json({ message: 'Error updating blog', error: error.message });
  }
});

app.delete('/admin/blogs/:id', async (req, res) => {
  try {
    const blog = await Blog.findByIdAndDelete(req.params.id);

    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    res.json({ message: 'Blog deleted successfully' });
  } catch (error) {
    console.error('Error deleting blog:', error);
    res.status(500).json({ message: 'Error deleting blog', error: error.message });
  }
});

app.get('/admin/blogs', async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', sortBy = 'created_at', order = 'desc' } = req.query;

    // Xây dựng query filter
    let filter = {};

    if (search) {
      filter.$text = { $search: search };
    }

    // Tính pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Xây dựng sort options
    const sortOptions = {};
    sortOptions[sortBy] = order === 'asc' ? 1 : -1;

    // Thực hiện query cho admin (trả về tất cả bài viết kể cả chưa xuất bản)
    const blogs = await Blog.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    // Đếm tổng số bài viết phù hợp với filter
    const totalBlogs = await Blog.countDocuments(filter);

    res.json({
      data: blogs,
      meta: {
        total: totalBlogs,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalBlogs / parseInt(limit)),
      }
    });
  } catch (error) {
    console.error('Error fetching blogs for admin:', error);
    res.status(500).json({ message: 'Error fetching blogs', error: error.message });
  }
});

app.get('/admin/blogs/:id', async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    res.json({ data: blog });
  } catch (error) {
    console.error('Error fetching blog for admin:', error);
    res.status(500).json({ message: 'Error fetching blog', error: error.message });
  }
});

// Route để tạo lại slug cho tất cả sản phẩm
app.post('/api/regenerate-slugs', async (req, res) => {
  try {
    const products = await ProductsModel.find({});

    for (const product of products) {
      if (product.name) {
        const newSlug = slugify(product.name, {
          lower: true,      // convert to lower case
          locale: 'vi',     // language code of the locale to use
          trim: true,       // trim leading and trailing replacement chars
          strict: true      // strip special characters except replacement
        });

        // Chỉ cập nhật nếu slug khác với slug hiện tại
        if (newSlug !== product.slug) {
          product.slug = newSlug;
          await product.save();
        }
      }
    }

    res.json({
      success: true,
      message: 'Đã tạo lại slug cho tất cả sản phẩm',
      count: products.length
    });
  } catch (error) {
    console.error('Lỗi khi tạo lại slug:', error);
    res.status(500).json({
      success: false,
      message: 'Có lỗi xảy ra khi tạo lại slug'
    });
  }
});

// API GET CATEGORY HIERARCHY
app.get('/get-category-hierarchy', async (req, res) => {
  try {
    // Lấy tất cả danh mục active và sắp xếp theo order
    const categories = await CategoriesModel.find({ status: true }).sort({ order: 1, name: 1 });

    // Tạo một object để lưu trữ cấu trúc cây
    const categoryTree = [];
    const categoryMap = {};
    const flatCategories = [];

    // Đầu tiên, tạo một map để dễ dàng truy cập danh mục theo ID
    categories.forEach(category => {
      categoryMap[category._id] = {
        ...category._doc,
        children: []
      };
    });

    // Xây dựng cấu trúc cây
    categories.forEach(category => {
      if (category.parent_id && categoryMap[category.parent_id]) {
        // Nếu có parent_id, thêm vào danh sách con của parent
        categoryMap[category.parent_id].children.push(categoryMap[category._id]);
      } else {
        // Nếu không có parent_id, đây là danh mục gốc
        categoryTree.push(categoryMap[category._id]);
      }
    });

    // Hàm đệ quy để thiết lập level và tạo danh sách phẳng với level
    function processLevel(categories, level) {
      // Sắp xếp categories theo order trước khi xử lý
      categories.sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));

      categories.forEach(category => {
        category.level = level;

        // Thêm vào danh sách phẳng với thông tin level
        flatCategories.push({
          _id: category._id,
          name: category.name,
          parent_id: category.parent_id,
          status: category.status,
          order: category.order,
          slug: category.slug,
          level,
          createdAt: category.createdAt,
          updatedAt: category.updatedAt
        });

        if (category.children && category.children.length > 0) {
          processLevel(category.children, level + 1);
        }
      });
    }

    // Xử lý level cho tất cả các danh mục
    processLevel(categoryTree, 0);

    res.status(200).json({
      statusCode: 200,
      message: 'Success',
      data: {
        tree: categoryTree,
        flatCategories: flatCategories
      }
    });
  } catch (error) {
    console.error("Error in get-category-hierarchy:", error);
    res.status(500).json({
      statusCode: 500,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// API GET CATEGORY BY ID
app.get('/get-category/:id', AuthLogin.authLoginNoRole(), async (req, res) => {
  try {
    const category = await CategoriesModel.findById(req.params.id);
    if (!category) {
      return res.status(404).json({
        statusCode: 404,
        message: 'Category not found'
      });
    }

    res.status(200).json({
      statusCode: 200,
      message: 'Success',
      data: category
    });
  } catch (error) {
    res.status(500).json({
      statusCode: 500,
      message: 'Error',
      error: error.message
    });
  }
});



// API GET PRODUCTS BY CATEGORY
app.get('/get-products-by-category/:categoryId', AuthLogin.authLoginNoRole(), async (req, res) => {
  try {
    const { categoryId } = req.params;

    // Tìm danh mục hiện tại và tất cả danh mục con của nó
    const categories = await CategoriesModel.find({});

    // Tạo một map để dễ dàng truy cập danh mục theo ID
    const categoryMap = {};
    categories.forEach(category => {
      categoryMap[category._id] = {
        ...category._doc,
        children: []
      };
    });

    // Xây dựng cấu trúc cây
    categories.forEach(category => {
      if (category.parent_id && categoryMap[category.parent_id]) {
        // Nếu có parent_id, thêm vào danh sách con của parent
        categoryMap[category.parent_id].children.push(categoryMap[category._id]);
      }
    });

    // Hàm đệ quy để lấy tất cả ID của danh mục con
    function getAllChildrenIds(category) {
      let ids = [category._id.toString()];

      if (category.children && category.children.length > 0) {
        category.children.forEach(child => {
          ids = [...ids, ...getAllChildrenIds(child)];
        });
      }

      return ids;
    }

    // Lấy tất cả ID của danh mục và danh mục con
    const categoryIds = getAllChildrenIds(categoryMap[categoryId]);

    // Tìm tất cả sản phẩm thuộc các danh mục này
    const products = await ProductsModel.find({ category_id: { $in: categoryIds } });

    res.status(200).json({
      statusCode: 200,
      message: 'Success',
      data: products
    });
  } catch (error) {
    res.status(500).json({
      statusCode: 500,
      message: 'Error',
      error: error.message
    });
  }
});

// API UPDATE PRODUCT STATUS
app.put('/update-product-status', async (req, res) => {
  try {
    const { id, status } = req.body;

    const updatedProduct = await ProductsModel.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({
        statusCode: 404,
        message: 'Product not found'
      });
    }

    res.status(200).json({
      statusCode: 200,
      message: 'Product status updated successfully',
      data: updatedProduct
    });
  } catch (error) {
    res.status(500).json({
      statusCode: 500,
      message: 'Error',
      error: error.message
    });
  }
});

// API UPDATE PRODUCT FEATURED
app.put('/update-product-featured', async (req, res) => {
  try {
    const { id, featured } = req.body;

    const updatedProduct = await ProductsModel.findByIdAndUpdate(
      id,
      { featured },
      { new: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({
        statusCode: 404,
        message: 'Product not found'
      });
    }

    res.status(200).json({
      statusCode: 200,
      message: 'Product featured status updated successfully',
      data: updatedProduct
    });
  } catch (error) {
    res.status(500).json({
      statusCode: 500,
      message: 'Error',
      error: error.message
    });
  }
});

// SEARCH API ENDPOINTS

// Unified search endpoint
app.get('/api/search', async (req, res) => {
  try {
    const { q, type = 'all', limit = 10, offset = 0 } = req.query;

    // Input validation
    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Từ khóa tìm kiếm là bắt buộc',
        error: 'INVALID_SEARCH_QUERY'
      });
    }

    const searchTerm = q.trim();
    if (searchTerm.length < 2) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Từ khóa tìm kiếm phải có ít nhất 2 ký tự',
        error: 'INVALID_SEARCH_QUERY'
      });
    }

    if (searchTerm.length > 100) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Từ khóa tìm kiếm không được vượt quá 100 ký tự',
        error: 'INVALID_SEARCH_QUERY'
      });
    }

    // Validate type parameter
    const validTypes = ['products', 'blogs', 'all'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Loại tìm kiếm không hợp lệ. Chỉ chấp nhận: products, blogs, all',
        error: 'INVALID_SEARCH_TYPE'
      });
    }

    // Validate pagination parameters
    const limitNum = parseInt(limit);
    const offsetNum = parseInt(offset);

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Limit phải là số từ 1 đến 50',
        error: 'INVALID_LIMIT'
      });
    }

    if (isNaN(offsetNum) || offsetNum < 0) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Offset phải là số không âm',
        error: 'INVALID_OFFSET'
      });
    }

    const startTime = Date.now();
    let results = [];
    let totalCount = 0;

    // Search products with optimized aggregation pipeline
    if (type === 'products' || type === 'all') {
      const productSearchPipeline = [
        {
          $match: {
            $and: [
              { status: true },
              {
                $or: [
                  { $text: { $search: searchTerm } },
                  { name: { $regex: searchTerm, $options: 'i' } },
                  { description_sale: { $regex: searchTerm, $options: 'i' } }
                ]
              }
            ]
          }
        },
        {
          $lookup: {
            from: 'categories',
            localField: 'category_id',
            foreignField: '_id',
            as: 'category'
          }
        },
        {
          $addFields: {
            category_id: { $arrayElemAt: ['$category', 0] },
            score: {
              $cond: {
                if: { $gt: [{ $meta: 'textScore' }, 0] },
                then: { $meta: 'textScore' },
                else: 1
              }
            }
          }
        },
        {
          $project: {
            _id: 1,
            name: 1,
            description_sale: 1,
            price: 1,
            images: { $slice: ['$images', 1] }, // Only first image for performance
            slug: 1,
            'category_id.name': 1,
            'category_id.slug': 1,
            createdAt: 1,
            score: 1
          }
        },
        {
          $sort: { score: -1, createdAt: -1 }
        }
      ];

      // Add pagination for products-only search
      if (type === 'products') {
        productSearchPipeline.push({ $skip: offsetNum });
        productSearchPipeline.push({ $limit: limitNum });
      } else {
        productSearchPipeline.push({ $limit: Math.ceil(limitNum / 2) });
      }

      const productResults = await ProductsModel.aggregate(productSearchPipeline);

      // Get count for pagination (only for products-only search)
      let productCount = 0;
      if (type === 'products') {
        const countPipeline = [
          {
            $match: {
              $and: [
                { status: true },
                {
                  $or: [
                    { $text: { $search: searchTerm } },
                    { name: { $regex: searchTerm, $options: 'i' } },
                    { description_sale: { $regex: searchTerm, $options: 'i' } }
                  ]
                }
              ]
            }
          },
          { $count: 'total' }
        ];
        const countResult = await ProductsModel.aggregate(countPipeline);
        productCount = countResult.length > 0 ? countResult[0].total : 0;
      }

      const formattedProducts = productResults.map(product => ({
        id: product._id,
        title: product.name,
        description: product.description_sale,
        type: 'product',
        url: `/san-pham/${product.slug}`,
        image: product.images && product.images.length > 0
          ? product.images[0].url
          : null,
        category: product.category_id?.name || null,
        metadata: {
          price: product.price,
          categorySlug: product.category_id?.slug || null,
          searchScore: product.score || 1
        }
      }));

      results = [...results, ...formattedProducts];
      if (type === 'products') {
        totalCount = productCount;
      }
    }

    // Search blogs with optimized aggregation pipeline
    if (type === 'blogs' || type === 'all') {
      const blogSearchPipeline = [
        {
          $match: {
            $and: [
              { is_published: true },
              {
                $or: [
                  { $text: { $search: searchTerm } },
                  { title: { $regex: searchTerm, $options: 'i' } },
                  { summary: { $regex: searchTerm, $options: 'i' } },
                  { content: { $regex: searchTerm, $options: 'i' } },
                  { tags: { $in: [new RegExp(searchTerm, 'i')] } }
                ]
              }
            ]
          }
        },
        {
          $addFields: {
            score: {
              $cond: {
                if: { $gt: [{ $meta: 'textScore' }, 0] },
                then: { $meta: 'textScore' },
                else: {
                  $add: [
                    // Title match gets highest score
                    { $cond: [{ $regexMatch: { input: '$title', regex: searchTerm, options: 'i' } }, 10, 0] },
                    // Summary match gets medium score
                    { $cond: [{ $regexMatch: { input: '$summary', regex: searchTerm, options: 'i' } }, 5, 0] },
                    // Tags match gets medium score
                    { $cond: [{ $in: [new RegExp(searchTerm, 'i'), '$tags'] }, 3, 0] },
                    // Content match gets base score
                    { $cond: [{ $regexMatch: { input: '$content', regex: searchTerm, options: 'i' } }, 1, 0] }
                  ]
                }
              }
            }
          }
        },
        {
          $project: {
            _id: 1,
            title: 1,
            summary: 1,
            image: 1,
            author: 1,
            tags: 1,
            slug: 1,
            created_at: 1,
            score: 1
          }
        },
        {
          $sort: { score: -1, created_at: -1 }
        }
      ];

      // Add pagination for blogs-only search
      if (type === 'blogs') {
        blogSearchPipeline.push({ $skip: offsetNum });
        blogSearchPipeline.push({ $limit: limitNum });
      } else {
        blogSearchPipeline.push({ $limit: Math.ceil(limitNum / 2) });
      }

      const blogResults = await Blog.aggregate(blogSearchPipeline);

      // Get count for pagination (only for blogs-only search)
      let blogCount = 0;
      if (type === 'blogs') {
        const countPipeline = [
          {
            $match: {
              $and: [
                { is_published: true },
                {
                  $or: [
                    { $text: { $search: searchTerm } },
                    { title: { $regex: searchTerm, $options: 'i' } },
                    { summary: { $regex: searchTerm, $options: 'i' } },
                    { content: { $regex: searchTerm, $options: 'i' } },
                    { tags: { $in: [new RegExp(searchTerm, 'i')] } }
                  ]
                }
              ]
            }
          },
          { $count: 'total' }
        ];
        const countResult = await Blog.aggregate(countPipeline);
        blogCount = countResult.length > 0 ? countResult[0].total : 0;
      }

      const formattedBlogs = blogResults.map(blog => ({
        id: blog._id,
        title: blog.title,
        description: blog.summary || blog.title,
        type: 'blog',
        url: `/blog/${blog.slug}`,
        image: blog.image || null,
        category: null,
        metadata: {
          author: blog.author,
          publishedAt: blog.created_at,
          tags: blog.tags || [],
          searchScore: blog.score || 1
        }
      }));

      results = [...results, ...formattedBlogs];
      if (type === 'blogs') {
        totalCount = blogCount;
      }
    }

    // For 'all' type, get total count differently
    if (type === 'all') {
      totalCount = results.length;
    }

    const executionTime = Date.now() - startTime;

    res.status(200).json({
      success: true,
      data: {
        results: results.slice(0, limitNum),
        pagination: {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: (offsetNum + limitNum) < totalCount
        },
        searchInfo: {
          query: searchTerm,
          type: type,
          executionTime: executionTime
        }
      },
      statusCode: 200,
      message: 'Tìm kiếm thành công'
    });

  } catch (error) {
    console.error('Search API error:', error);
    res.status(500).json({
      success: false,
      statusCode: 500,
      message: 'Lỗi server, vui lòng thử lại sau',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// Search suggestions endpoint for autocomplete
app.get('/api/search/suggestions', async (req, res) => {
  try {
    const { q, type = 'all', limit = 5 } = req.query;

    // Input validation
    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Từ khóa tìm kiếm là bắt buộc',
        error: 'INVALID_SEARCH_QUERY'
      });
    }

    const searchTerm = q.trim();
    if (searchTerm.length < 2) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Từ khóa tìm kiếm phải có ít nhất 2 ký tự',
        error: 'INVALID_SEARCH_QUERY'
      });
    }

    // Validate type parameter
    const validTypes = ['products', 'blogs', 'all'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Loại tìm kiếm không hợp lệ. Chỉ chấp nhận: products, blogs, all',
        error: 'INVALID_SEARCH_TYPE'
      });
    }

    // Validate limit parameter
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 10) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Limit phải là số từ 1 đến 10',
        error: 'INVALID_LIMIT'
      });
    }

    const startTime = Date.now();
    let suggestions = [];

    // Get product suggestions with optimized query
    if (type === 'products' || type === 'all') {
      const productLimit = type === 'all' ? Math.min(5, limitNum) : limitNum;

      const productSuggestionsPipeline = [
        {
          $match: {
            $and: [
              { status: true },
              {
                $or: [
                  { name: { $regex: searchTerm, $options: 'i' } },
                  { description_sale: { $regex: searchTerm, $options: 'i' } }
                ]
              }
            ]
          }
        },
        {
          $lookup: {
            from: 'categories',
            localField: 'category_id',
            foreignField: '_id',
            as: 'category'
          }
        },
        {
          $addFields: {
            category_id: { $arrayElemAt: ['$category', 0] }
          }
        },
        {
          $project: {
            _id: 1,
            name: 1,
            description_sale: 1,
            price: 1,
            images: { $slice: ['$images', 1] },
            slug: 1,
            'category_id.name': 1,
            'category_id.slug': 1
          }
        },
        {
          $sort: { createdAt: -1 }
        },
        {
          $limit: productLimit
        }
      ];

      const productSuggestions = await ProductsModel.aggregate(productSuggestionsPipeline);

      const formattedProductSuggestions = productSuggestions.map(product => ({
        id: product._id,
        title: product.name,
        description: product.description_sale,
        type: 'product',
        url: `/san-pham/${product.slug}`,
        image: product.images && product.images.length > 0
          ? product.images[0].url
          : null,
        category: product.category_id?.name || null,
        metadata: {
          price: product.price,
          categorySlug: product.category_id?.slug || null
        }
      }));

      suggestions = [...suggestions, ...formattedProductSuggestions];
    }

    // Get blog suggestions with optimized query
    if (type === 'blogs' || type === 'all') {
      const blogLimit = type === 'all' ? Math.min(5, limitNum) : limitNum;

      const blogSuggestionsPipeline = [
        {
          $match: {
            $and: [
              { is_published: true },
              {
                $or: [
                  { title: { $regex: searchTerm, $options: 'i' } },
                  { summary: { $regex: searchTerm, $options: 'i' } },
                  { tags: { $in: [new RegExp(searchTerm, 'i')] } }
                ]
              }
            ]
          }
        },
        {
          $project: {
            _id: 1,
            title: 1,
            summary: 1,
            image: 1,
            author: 1,
            tags: 1,
            slug: 1,
            created_at: 1
          }
        },
        {
          $sort: { created_at: -1 }
        },
        {
          $limit: blogLimit
        }
      ];

      const blogSuggestions = await Blog.aggregate(blogSuggestionsPipeline);

      const formattedBlogSuggestions = blogSuggestions.map(blog => ({
        id: blog._id,
        title: blog.title,
        description: blog.summary || blog.title,
        type: 'blog',
        url: `/blog/${blog.slug}`,
        image: blog.image || null,
        category: null,
        metadata: {
          author: blog.author,
          publishedAt: blog.created_at,
          tags: blog.tags || []
        }
      }));

      suggestions = [...suggestions, ...formattedBlogSuggestions];
    }

    // Limit total suggestions
    const finalSuggestions = suggestions.slice(0, limitNum);
    const executionTime = Date.now() - startTime;

    res.status(200).json({
      success: true,
      data: {
        suggestions: finalSuggestions,
        searchInfo: {
          query: searchTerm,
          type: type,
          totalFound: finalSuggestions.length,
          executionTime: executionTime
        }
      },
      statusCode: 200,
      message: 'Lấy gợi ý tìm kiếm thành công'
    });

  } catch (error) {
    console.error('Search suggestions API error:', error);
    res.status(500).json({
      success: false,
      statusCode: 500,
      message: 'Lỗi server, vui lòng thử lại sau',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
});

app.listen(process.env.PORT, () => {
  // Server started successfully
});
