const jwt = require('jsonwebtoken');
const helpDelete = require('../util/delete');
const jwtSecret = 'askdkasdkaskdkasdk';
const authLogin = permission => {
    return (req, res, next) => {
        try {
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, jwtSecret);
        } 
        catch (e) {
            return res.status(500).json({message: 'You need to login!'});
        }
        const {role} = req.body;
        if(!permission.includes(role)) {
           return res.status(403).json("You must have permission!")
        }
        next();
    }
}

const authLoginWithUploadFile = permission => {
    return (req, res, next) => {
        try {
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, jwtSecret);
        } 
        catch (e) {
            if(req.files) {
                req.files.map(obj => {
                    helpDelete.deleteFile(obj.path);
                })
            }
            if(req.file) {
                helpDelete.deleteFile(req.file.path);
            }
            return res.status(500).json({message: 'You need to login!'})
        }
        const {role} = req.body;
        if(!permission.includes(role)) {
            if(req.files) {
                req.files.map(obj => {
                    helpDelete.deleteFile(obj.path);
                })
            }
            if(req.file) {
                helpDelete.deleteFile(req.file.path);
            }
           return res.status(403).json("You must have permission!")
        }
        next();
    }
}

const authLoginNoRole = () => {
    return (req, res, next) => {
        try {
            const token = req.headers.authorization.split(' ')[1];
            const result =  jwt.verify(token, jwtSecret);
            if(result) {
                next();
            }
        } 
        catch (e) {
            res.status(500).json({message: 'You need to login!'})
        }
    }
}

module.exports = {
    authLogin,
    authLoginNoRole,
    authLoginWithUploadFile
}