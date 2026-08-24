// 云函数：login —— 返回当前用户的 openid [硬约束 #14]
// 同步层的用户身份来源。部署方式：微信开发者工具右键 cloudfunctions/login →「上传并部署：云端安装依赖」
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  return { openid: OPENID };
};
