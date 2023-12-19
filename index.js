const express = require('express');
const app = express();
require('dotenv').config();
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./Models/User');
const mongoose = require('mongoose');
const multer = require('multer');
const ImageModel = require('./Models/image');
const CategoriesModel = require('./Models/categories');
const ProductsModel = require('./Models/products');
const CartModel = require('./Models/cart');
const OrderModel = require('./Models/order');
const helpDelete = require('./util/delete');
const AuthLogin = require('./middleware/authLogin')
const bodyParser = require('body-parser');
const EmailModel = require('./Models/email');
const {catchDeleteFile} = require('./util/catchDeleteFile');
const {deleteFile} = require('./util/firebaseHandle');

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
    credentials: true,
    origin: '*'
}));
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(express.json());
app.use(express.static('uploads'));

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
        const saveFile = await CategoriesModel.create({
            name: req.body.name,
            image: req.body.file
        });
        res.json({message: 'Save image successfully!', data: saveFile, statusCode: 200});
    } catch {
        catchDeleteFile(req);
        res.status(422).json({message: 'Save image failed!', statusCode: 500})
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

// PRODUCTS
app.post('/add-product',async (req,res,next) => {
    if(req.body.files.length === 0) {
        return res.status(422).json({message: 'File is empty,save product failed!', statusCode: 422})
    }
    try {
        const saveFile = await ProductsModel.create({
            name: req.body.name,
            price: req.body.price,
            category_id: req.body.category_id,
            category_product: req.body.category_name,
            description_sale: req.body.description_sale,
            description_detail: req.body.description_detail,
            image: req.body.files
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
                image: newFiles
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

app.post('/get-product-detail',async (req,res,next) => {
    try {
        const {id} = req.body;
        const getProductDetail =  await ProductsModel.findOne({_id: id});
        res.json({message: 'Get product successfully!', data: getProductDetail, statusCode: 200});
    } catch {
        res.status(422).json({message: 'Save product failed!', statusCode: 500})
    }
    
});

app.post('/related-product',AuthLogin.authLoginNoRole(),async (req,res,next) => {
    try {
        const {id} = req.body;
        const result =  await ProductsModel.find({category_id: id});
        res.json({message: 'Get image successfully!', data: result, statusCode: 200});
    } catch {
        res.status(422).json({message: 'Save image failed!', statusCode: 500})
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
        const saveFile = await ProductsModel.create({
            name: req.body.name,
            description: req.body.description,
            image: req.body.files
        });
        res.json({message: 'Save slide middle successfully!', data: saveFile, statusCode: 200});
    } catch {
        catchDeleteFile(req);
        res.status(422).json({message: 'Save product failed!', statusCode: 500})
    }
});

app.get('/get-slide-middle',async (req,res,next) => {
    try {
        const getProducts =  await ProductsModel.find();
        res.json({message: 'Get products successfully!', data: getProducts, statusCode: 200});
    } catch {
        res.status(422).json({message: 'Save products failed!', statusCode: 500})
    }
});

app.listen(process.env.PORT);