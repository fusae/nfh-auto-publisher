// 测试：使用 UEditor API 插入图片
// 在浏览器控制台中运行此代码

// 1. 获取编辑器实例
const iframe = document.querySelector('iframe[id*="ueditor"]');
const editorId = iframe.id.replace('_iframe', '');
const editor = UE.getEditor(editorId);

// 2. 方法一：使用 execCommand 插入图片（需要图片 URL）
editor.execCommand('insertimage', {
  src: 'https://example.com/image.jpg',
  alt: '图片描述'
});

// 3. 方法二：直接插入 HTML
editor.execCommand('inserthtml', '<img src="https://example.com/image.jpg" />');

// 4. 方法三：使用 base64 图片
editor.execCommand('inserthtml', '<img src="data:image/png;base64,iVBORw0KG..." />');

// 5. 检查编辑器是否有图片上传配置
console.log('图片上传配置:', editor.getOpt('imageActionName'));
console.log('图片上传 URL:', editor.getOpt('imageUrl'));
