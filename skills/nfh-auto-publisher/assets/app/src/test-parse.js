import mammoth from 'mammoth';

const docPath = process.argv[2] || '~/Downloads/40+，一切刚好.docx';

mammoth.convertToHtml({ path: docPath.replace('~', process.env.HOME) })
  .then(result => {
    console.log('HTML 长度:', result.value.length);
    console.log('\n前 2000 字符:');
    console.log(result.value.substring(0, 2000));
    console.log('\n...\n');
    console.log('后 500 字符:');
    console.log(result.value.substring(result.value.length - 500));
  })
  .catch(err => console.error(err));
