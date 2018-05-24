const fs = require('fs');
const path = require('path');
const { writeFile, removeFile } = require('./file');
const { isConfigChanged } = require('./equal');

let oldPages = [];
let template = '';

const mixinReg = /\n*Vue\.mixin(.*).*\n*/;

function parsePath(page, paths) {
  const pagePath = page.path.replace(/^\//, '');
  const fileName = pagePath.replace(/\/(\w)/g, (match, $1) => $1.toUpperCase());
  const entryPath = path.join(paths.entry, `${fileName}.js`);

  return { pagePath, entryPath };
}

function genEntry(paths, cause = 'initial') {
  const entry = { app: paths.template };

  if (cause !== 'pages') {
    template = fs.readFileSync(paths.template).toString().replace(/\n*.*mpType.*\n*/, '\n\n');
    while (mixinReg.test(template)) {
      template = template.replace(mixinReg, '\n\n')
        .replace(new RegExp(`\n*import ${RegExp.$1 || null}.*\n*`), '\n\n');
    }
  }

  require.cache[paths.pages] = null;
  const pages = require(paths.pages);

  // 不造怎么主动触发编译，暂时找一个幸运的页面重新生成下
  const luckyPageIndex = pages.findIndex(page =>
    oldPages.find(oldPage => oldPage.path === page.path));

  const queue = pages.map((page, index) => {
    const { pagePath, entryPath } = parsePath(page, paths);
    const pageConfig = JSON.stringify({ config: page.config }, null, '  ');

    entry[pagePath] = entryPath;

    if (cause !== 'pages' || index === luckyPageIndex || isConfigChanged(page, oldPages)) {
      return writeFile(entryPath, template
        .replace(/import App from .*/, `import App from '@/${pagePath}'`)
        .replace(/export default ?{[^]*}/, `export default ${pageConfig}`));
    }

    return Promise.resolve();
  });

  oldPages.filter(oldPage => !pages.find(page => page.path === oldPage.path))
    .forEach((oldPage) => {
      const { pagePath, entryPath } = parsePath(oldPage, paths);
      const distDir = path.dirname(paths.app);

      removeFile([
        entryPath,
        path.join(distDir, `${pagePath}.js`),
        path.join(distDir, `${pagePath}.json`),
        path.join(distDir, `${pagePath}.wxml`),
        path.join(distDir, `${pagePath}.wxss`),
      ]);
    });

  if (cause !== 'initial') {
    require.cache[paths.app] = null;
    const app = require(paths.app);

    app.pages = pages.map(page => page.path.replace(/^\//, ''));

    fs.writeFileSync(paths.app, JSON.stringify(app, null, '  '));
  }

  oldPages = [].concat(pages);

  return Promise.all(queue).then(() => entry);
}

module.exports = {
  genEntry,
};