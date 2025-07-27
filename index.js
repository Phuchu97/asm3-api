const express = require('express');
const app = express();
require('dotenv').config();
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
const EmailModel = require('./Models/email');
const {catchDeleteFile} = require('./util/catchDeleteFile');
const {deleteFile} = require('./util/firebaseHandle');
const Blog = require('./Models/blog');

// Middleware xác thực token cho các route blog admin
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
    console.log('Connect to MonDu successfully!');
})
.catch(() => {
    console.log('Connect to MonDu failed!');
});

const Storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads')
    },
    filename: (req,file,cb) => {
        cb(null,new Date().toISOString().replace(/:/g,"-")+file.originalname)
    }
});

const filterImage = (req,file,cb) => {
    if(
        file.mimetype === 'image/png'||
        file.mimetype === 'image/jpg'||
        file.mimetype === 'image/jpeg'
    ) {
        cb(null,true);
    } else {
        cb(null,false);
    }
}

const upload = multer({storage: Storage, fileFilter: filterImage});
const bcryptSalt = bcrypt.genSaltSync(10);

app.use(cors({
    origin: "*",
    // methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    // allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true
}));
app.use(bodyParser.urlencoded({
    extended: true,
    limit: '100mb'
}));
app.use(express.json({ limit: '100mb' }));
app.use(express.static('uploads'));

app.get('/',(req,res,next) => {
    res.json({message: 'API is running', statusCode: 200});
})

app.post('/login', async (req, res) => {
    const {username,password} = req.body;
    const checkUser = await User.findOne({username});
    if(checkUser) {
        const passOk = bcrypt.compareSync(password, checkUser.password);
        if(passOk) {
            jwt.sign({username: checkUser.username, id: checkUser._id},process.env.JWTKEY, (err, token) => {
                if(err) throw err;
                res.cookie('token', token).json({message: 'password ok',token: token,username: checkUser.username,userId: checkUser._id,role: checkUser.role, statusCode: 200})
            })
        } else {
            res.status(422).json({message: 'password not ok', statusCode: 500})
        }
    } else {
        res.json('not found')
    }
})

app.post('/register', async (req, res) => {
    const {username,password} = req.body;
    try {
        const userDoc = await User.create({
            username,
            password: bcrypt.hashSync(password, bcryptSalt),
            role: 'ADMIN'
        })
        res.json({message: 'Register successfully!', data: userDoc, statusCode: 200});
    }
    catch (e) {
        res.status(422).json(e)
    }
})



app.post('/add-slide',AuthLogin.authLoginWithUploadFile(['ADMIN']),async (req,res,next) => {
    if(!req.body.file) {
        return res.status(422).json('File is empty')
    }
    try {
        const saveFile = await ImageModel.create({
            name: 'slide',
            image: req.body.file
        });
        res.json({message: 'Save image successfully!', data: saveFile, statusCode: 200});
    } catch {
        catchDeleteFile(req);
        res.status(422).json({message: 'Save image failed!', statusCode: 500})
    }
});


app.get('/get-slide',async (req,res,next) => {
    try {
        const getFiles =  await ImageModel.find({name: 'slide'});
        res.json({message: 'Get image successfully!', data: getFiles, statusCode: 200});
    } catch {
        res.status(422).json({message: 'Get image failed!', statusCode: 500})
    }
});

app.delete('/delete-slide',AuthLogin.authLogin(['ADMIN']),async (req,res,next) => {
    try {
        const {id} = req.body;
        if(!id) return res.status(422).json({message: 'Have no ID!', statusCode: 500});
        await ImageModel.deleteOne({_id: id});
        res.json({message: 'Delete image successfully!', statusCode: 200});
    } catch {
        res.status(422).json({message: 'Delete image failed!', statusCode: 500})
    }
});


// CATEGORIES
app.post('/add-category',AuthLogin.authLoginWithUploadFile(['ADMIN']),async (req,res,next) => {
    try {
        if(!req.body.file) {
            return res.status(422).json('File is empty')
        }
        
        // Kiểm tra parent_id nếu có
        if (req.body.parent_id) {
            const parentCategory = await CategoriesModel.findById(req.body.parent_id);
            if (!parentCategory) {
                return res.status(400).json({
                    message: 'Parent category not found',
                    statusCode: 400
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
            name: req.body.name,
            image: req.body.file,
            description: req.body.description || '',
            parent_id: req.body.parent_id || null,
            status: req.body.status !== undefined ? req.body.status : true,
            order: req.body.order || 0,
            slug
        });
        res.json({message: 'Save image successfully!', data: saveFile, statusCode: 200});
    } catch (error) {
        catchDeleteFile(req);
        res.status(422).json({message: 'Save image failed!', statusCode: 500, error: error.message})
    }
});

app.get('/get-categories',async (req,res,next) => {
    try {
        const getCategories =  await CategoriesModel.find();
        res.json({message: 'Get image successfully!', data: getCategories, statusCode: 200});
    } catch {
        res.status(422).json({message: 'Save image failed!', statusCode: 500})
    }
});

app.get('/get-categories-hierarchical', async (req, res, next) => {
    try {
        const categories = await CategoriesModel.find({});
        
        const categoryTree = [];
        const categoryMap = {};
        const flatCategories = [];
        
        categories.forEach(category => {
          categoryMap[category._id] = {
            ...category._doc,
            children: []
          };
        });
        
        categories.forEach(category => {
          if (category.parent_id && categoryMap[category.parent_id]) {
            categoryMap[category.parent_id].children.push(categoryMap[category._id]);
          } else {
            categoryTree.push(categoryMap[category._id]);
          }
        });
        
        res.json({
            message: 'Get hierarchical categories successfully!', 
            data: categoryTree, 
            statusCode: 200
        });
    } catch (error) {
        console.error('Error fetching hierarchical categories:', error);
        res.status(500).json({
            message: 'Error fetching hierarchical categories', 
            statusCode: 500
        });
    }
});


app.delete('/delete-category',AuthLogin.authLogin(['ADMIN']),async (req,res,next) => {
    try {
        const {id} = req.body;
        const getCategory =  await CategoriesModel.find({_id: id});
        deleteFile(getCategory[0].image);
        await CategoriesModel.deleteOne({_id: id});
        res.json({message: 'Delete image successfully!', statusCode: 200});
    } catch {
        res.status(422).json({message: 'Delete image failed!', statusCode: 500})
    }
});

// Thêm API endpoint cập nhật danh mục
app.post('/edit-category',AuthLogin.authLoginWithUploadFile(['ADMIN']),async (req,res,next) => {
    try {
        const updateData = {
            name: req.body.name,
            description: req.body.description || '',
            status: req.body.status !== undefined ? req.body.status : true,
            order: req.body.order || 0,
            parent_id: req.body.parent_id || null
        };
        
            // Cập nhật slug nếu có thay đổi tên
    if (req.body.name) {
        updateData.slug = slugify(req.body.name, {
            lower: true,      // convert to lower case
            locale: 'vi',     // language code of the locale to use
            trim: true,       // trim leading and trailing replacement chars
            strict: true      // strip special characters except replacement
        });
    }
        
        // Nếu có file mới, cập nhật file
        if(req.body.file) {
            // Xóa file cũ nếu có
            const getCategory = await CategoriesModel.findOne({_id: req.body.id});
            if(getCategory && getCategory.image) {
                deleteFile(getCategory.image);
            }
            updateData.image = req.body.file;
        }
        
        const saveFile = await CategoriesModel.updateOne(
            {_id: req.body.id},
            updateData
        );
        
        res.json({message: 'Update category successfully!', data: saveFile, statusCode: 200});
    } catch(error) {
        if(req.body.file) {
            catchDeleteFile(req);
        }
        res.status(422).json({message: 'Update category failed!', statusCode: 500})
    }
});

// PRODUCTS
app.post('/add-product',async (req,res,next) => {
    if(req.body.files.length === 0) {
        return res.status(422).json({message: 'File is empty,save product failed!', statusCode: 422})
    }
    try {
        // Tạo slug từ tên sản phẩm nếu không được cung cấp
        let slug = req.body.slug;
        if (!slug && req.body.name) {
            slug = slugify(req.body.name, {
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
        }
        
        const saveFile = await ProductsModel.create({
            name: req.body.name,
            price: req.body.price,
            category_id: req.body.category_id,
            category_product: req.body.category_name,
            description_sale: req.body.description_sale,
            description_detail: req.body.description_detail,
            image: req.body.files,
            slug,
            specifications: req.body.specifications || {},
            status: req.body.status !== undefined ? req.body.status : true,
            featured: req.body.featured !== undefined ? req.body.featured : false,
            keywords: req.body.keywords || []
        });
        res.json({message: 'Save product successfully!', data: saveFile, statusCode: 200});
    } catch {
        catchDeleteFile(req);
        res.status(422).json({message: 'Save product failed!', statusCode: 500})
    }
});

app.post('/edit-product',upload.array('photos',4),AuthLogin.authLoginWithUploadFile(['ADMIN']),async (req,res,next) => {
    if(req.files.length > 0) {
        const newFiles = req.files.map(obj => {
            return {
                file_type: obj.mimetype,
                file_url: obj.filename,
                file_path: obj.path
            }
        });
        try {
            const getProductDetail =  await ProductsModel.findOne({_id: req.body.id});
            getProductDetail.image.forEach(item => {
                helpDelete.deleteFile(item.file_path);
            });
            const saveFile = await ProductsModel.updateOne({_id: req.body.id},{
                name: req.body.name,
                price: req.body.price,
                category_id: req.body.category_id,
                category_product: req.body.category_name,
                description_sale: req.body.description_sale,
                description_detail: req.body.description_detail,
                image: newFiles,
                specifications: req.body.specifications || {},
                status: req.body.status !== undefined ? req.body.status : true,
                featured: req.body.featured !== undefined ? req.body.featured : false,
                keywords: req.body.keywords || []
            });
            res.json({message: 'Edit product successfully!', data: saveFile, statusCode: 200});
        } catch {
            catchDeleteFile(req);
            res.status(422).json({message: 'Edit product failed!', statusCode: 500})
        }
    } else {
        try {
            const saveFile = await ProductsModel.updateOne({_id: req.body.id},{
                name: req.body.name,
                price: req.body.price,
                category_id: req.body.category_id,
                category_product: req.body.category_name,
                description_sale: req.body.description_sale,
                description_detail: req.body.description_detail,
                specifications: req.body.specifications || {},
                status: req.body.status !== undefined ? req.body.status : true,
                featured: req.body.featured !== undefined ? req.body.featured : false,
                keywords: req.body.keywords || []
            });
            res.json({message: 'Edit product successfully!', data: saveFile, statusCode: 200});
        } catch {
            catchDeleteFile(req);
            res.status(422).json({message: 'Edit product failed!', statusCode: 500})
        }
    }
});

app.get('/get-products',async (req,res,next) => {
    try {
        const getProducts =  await ProductsModel.find();
        res.json({message: 'Get products successfully!', data: getProducts, statusCode: 200});
    } catch {
        res.status(422).json({message: 'Save products failed!', statusCode: 500})
    }
});

app.get('/get-product/:id', async (req, res, next) => {
    try {
        const id = req.params.id;
        let product;
        
        // Thử tìm theo ID
        if (mongoose.Types.ObjectId.isValid(id)) {
            product = await ProductsModel.findOne({ _id: id });
        }
        
        // Nếu không tìm thấy theo ID, thử tìm theo slug
        if (!product) {
            product = await ProductsModel.findOne({ slug: id });
        }
        
        if (!product) {
            return res.status(404).json({
                message: 'Không tìm thấy sản phẩm',
                statusCode: 404
            });
        }
        
        res.json({
            message: 'Lấy thông tin sản phẩm thành công',
            data: product,
            statusCode: 200
        });
    } catch (error) {
        console.error('Lỗi khi lấy sản phẩm:', error);
        res.status(500).json({
            message: 'Lỗi khi lấy thông tin sản phẩm',
            statusCode: 500
        });
    }
});

app.post('/get-product-detail',async (req,res,next) => {
    try {
        const {id} = req.body;
        const getProductDetail =  await ProductsModel.findOne({_id: id});
        res.json({message: 'Get product successfully!', data: getProductDetail, statusCode: 200});
    } catch {
        res.status(422).json({message: 'Save product failed!', statusCode: 500})
    }
    
});

app.post('/related-product',async (req,res,next) => {
    try {
        const {id} = req.body;
        const result =  await ProductsModel.find({category_id: id}).limit(9);
        res.json({message: 'Get image successfully!', data: result, statusCode: 200});
    } catch {
        res.status(422).json({message: 'Save image failed!', statusCode: 500})
    }
});

// API lọc sản phẩm theo danh mục và sắp xếp
app.post('/filter-products', async (req, res, next) => {
    try {
        const { 
            categoryId, 
            sortBy, 
            sortOrder, 
            page = 1, 
            limit = 12,
            featured,
            keyword
        } = req.body;
        
        // Xây dựng query filter
        let query = {};
        
        // Lọc theo danh mục nếu có
        if (categoryId) {
            // Kiểm tra xem categoryId có phải là danh mục cha không
            const category = await CategoriesModel.findById(categoryId);
            
            if (category) {
                if (!category.parent_id) {
                    // Đây là danh mục cha, tìm tất cả danh mục con
                    const childCategories = await CategoriesModel.find({ parent_id: categoryId });
                    const childCategoryIds = childCategories.map(c => c._id.toString());
                    
                    // Lọc sản phẩm thuộc danh mục cha hoặc bất kỳ danh mục con nào
                    query.$or = [
                        { category_id: categoryId },
                        { category_id: { $in: childCategoryIds } }
                    ];
                } else {
                    // Đây là danh mục con, chỉ lọc theo danh mục này
                    query.category_id = categoryId;
                }
            } else {
                // Nếu không tìm thấy danh mục, vẫn lọc theo ID được cung cấp
                query.category_id = categoryId;
            }
        }
        
        // Lọc theo featured nếu được chỉ định
        if (featured !== undefined) {
            query.featured = featured;
        }
        
        // Lọc theo từ khóa nếu có
        if (keyword) {
            const keywordFilter = [
                { name: { $regex: keyword, $options: 'i' } },
                { keywords: { $in: [new RegExp(keyword, 'i')] } }
            ];
            
            // Kết hợp với filter danh mục nếu có
            if (query.$or) {
                // Đã có điều kiện $or cho danh mục, cần kết hợp bằng $and
                query = {
                    $and: [
                        { $or: query.$or },
                        { $or: keywordFilter }
                    ]
                };
            } else {
                query.$or = keywordFilter;
            }
        }
        
        // Chỉ hiển thị sản phẩm có trạng thái active
        if (!query.$and) {
            query.status = true;
        } else {
            query.$and.push({ status: true });
        }
        
        // Xây dựng options sắp xếp
        let sort = {};
        
        if (sortBy && sortOrder) {
            if (sortBy === 'price') {
                sort.price = sortOrder === 'asc' ? 1 : -1;
            } else if (sortBy === 'name') {
                sort.name = sortOrder === 'asc' ? 1 : -1;
            } else if (sortBy === 'createdAt') {
                sort.createdAt = sortOrder === 'desc' ? -1 : 1;
            }
        } else {
            // Mặc định sắp xếp theo ngày tạo mới nhất
            sort.createdAt = -1;
        }
        
        // Tính toán skip cho phân trang
        const skip = (page - 1) * limit;
        
        // Thực hiện truy vấn
        const products = await ProductsModel.find(query)
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit));
            
        // Đếm tổng số sản phẩm phù hợp với query
        const total = await ProductsModel.countDocuments(query);
        
        res.json({
            message: 'Filter products successfully!', 
            data: {
                products,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(total / limit)
                }
            }, 
            statusCode: 200
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({message: 'Filter products failed!', statusCode: 500});
    }
});

app.delete('/delete-product',AuthLogin.authLogin(['ADMIN']),async (req,res,next) => {
    try {
        const {id} = req.body;
        const getProduct =  await ProductsModel.find({_id: id});
        getProduct[0].image.forEach(item => {
            deleteFile(item);
        });
        await ProductsModel.deleteOne({_id: id});
        res.json({message: 'Delete image successfully!', statusCode: 200});
    } catch {
        res.status(422).json({message: 'Delete image failed!', statusCode: 500})
    }
});


// CART

app.post('/add-cart',async (req,res,next) => {
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
        res.json({message: 'Save cart successfully!', data: saveFile, statusCode: 200});
    } catch {
        res.status(422).json({message: 'Save cart failed!', statusCode: 500})
    }
});

app.post('/get-list-cart',async (req,res,next) => {
    try {
        const {id} = req.body;
        const listCart = await CartModel.find({user_id: id});
        res.json({message: 'Get list cart successfully!', data: listCart, statusCode: 200});
    } catch {
        res.status(422).json({message: 'Get list cart failed!', statusCode: 500})
    }
});

app.delete('/delete-cart-item',async (req,res,next) => {
    try {
        const {id} = req.body;
        await CartModel.deleteOne({_id: id});
        res.json({message: 'Delete order successfully!', statusCode: 200});
    } catch {
        res.status(422).json({message: 'Delete order failed!', statusCode: 500});
    }
});


// ORDER
app.post('/add-order',AuthLogin.authLoginNoRole(),async (req,res,next) => {
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
            } else {
              console.log('API called successfully.');
            }
        });
        await CartModel.deleteMany({user_id: req.body.user_id});
        res.json({message: 'Create order successfully!', data: saveFile, statusCode: 200});
    } catch {
        res.status(422).json({message: 'Create order failed!', statusCode: 500})
    }
});

app.post('/get-list-order',AuthLogin.authLoginNoRole(),async (req,res,next) => {
    try {
        const {id} = req.body;
        const listCart = await OrderModel.find({user_id: id});
        res.json({message: 'Get list cart successfully!', data: listCart, statusCode: 200});
    } catch {
        res.status(422).json({message: 'Get list cart failed!', statusCode: 500})
    }
});

app.post('/get-list-cart-order',AuthLogin.authLoginNoRole(),async (req,res,next) => {
    try {
        const {id} = req.body;
        const listCart = await OrderModel.find({_id: id});
        res.json({message: 'Get list cart successfully!', data: listCart, statusCode: 200});
    } catch {
        res.status(422).json({message: 'Get list cart failed!', statusCode: 500})
    }
});


// slide middle

app.post('/add-slide-middle',async (req,res,next) => {
    if(req.body.files.length === 0) {
        return res.status(422).json({message: 'File is empty,save product failed!', statusCode: 422})
    }
    try {
        const saveFile = await SlideMiddleModel.updateOne({_id: req.body.id},{
            name: req.body.name,
            description: req.body.description,
            image: req.body.files
        });
        res.json({message: 'Save slide middle successfully!', data: saveFile, statusCode: 200});
    } catch {
        catchDeleteFile(req);
        res.status(422).json({message: 'Save Slide Middle failed!', statusCode: 500})
    }
});

app.get('/get-slide-middle',async (req,res,next) => {
    try {
        const getSlideMiddle =  await SlideMiddleModel.find({});
        res.json({message: 'Get Slide Middle successfully!', data: getSlideMiddle, statusCode: 200});
    } catch {
        res.status(422).json({message: 'Save Slide Middle failed!', statusCode: 500})
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

    console.log('CHECK BLOGS', blogs);
    
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
    // Lấy tất cả danh mục
    const categories = await CategoriesModel.find({});
    
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
      const categoryWithLevel = {
        ...category._doc,
        level: 0 // Mặc định level = 0
      };
      
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
      categories.forEach(category => {
        category.level = level;
        
        // Thêm vào danh sách phẳng với thông tin level
        flatCategories.push({
          ...category,
          level
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
      message: 'Error',
      error: error.message
    });
  }
});

// API GET CATEGORY BY ID
app.get('/get-category/:id', AuthLogin.authLogin, async (req, res) => {
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

// API UPDATE CATEGORY
app.put('/update-category', AuthLogin.authLogin, async (req, res) => {
  try {
    const { id, name, description, status, order, parent_id, image } = req.body;
    
    // Kiểm tra xem danh mục có tồn tại không
    const category = await CategoriesModel.findById(id);
    if (!category) {
      return res.status(404).json({
        statusCode: 404,
        message: 'Category not found'
      });
    }
    
    // Kiểm tra xem parent_id có hợp lệ không
    if (parent_id) {
      const parentCategory = await CategoriesModel.findById(parent_id);
      if (!parentCategory) {
        return res.status(400).json({
          statusCode: 400,
          message: 'Parent category not found'
        });
      }
      
      // Kiểm tra xem có tạo ra vòng lặp không
      if (parent_id === id) {
        return res.status(400).json({
          statusCode: 400,
          message: 'A category cannot be its own parent'
        });
      }
    }
    
    // Cập nhật danh mục
    const updatedCategory = await CategoriesModel.findByIdAndUpdate(
      id,
      {
        name,
        description,
        status,
        order,
        parent_id,
        image
      },
      { new: true }
    );
    
    res.status(200).json({
      statusCode: 200,
      message: 'Category updated successfully',
      data: updatedCategory
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
app.get('/get-products-by-category/:categoryId', AuthLogin.authLogin, async (req, res) => {
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
app.put('/update-product-status', AuthLogin.authLogin, async (req, res) => {
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
app.put('/update-product-featured', AuthLogin.authLogin, async (req, res) => {
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

app.listen(process.env.PORT);