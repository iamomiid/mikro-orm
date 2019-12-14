(window.webpackJsonp=window.webpackJsonp||[]).push([[74],{206:function(e,t,n){"use strict";n.r(t),n.d(t,"frontMatter",(function(){return r})),n.d(t,"rightToc",(function(){return l})),n.d(t,"default",(function(){return p}));var i=n(1),a=n(9),o=(n(0),n(290)),r={title:"Usage with MongoDB"},l=[{value:"Defining entity",id:"defining-entity",children:[]},{value:"ObjectID and string id duality",id:"objectid-and-string-id-duality",children:[]},{value:"ManyToMany collections with inlined pivot array",id:"manytomany-collections-with-inlined-pivot-array",children:[]},{value:"Native collection methods",id:"native-collection-methods",children:[]}],c={rightToc:l},s="wrapper";function p(e){var t=e.components,n=Object(a.a)(e,["components"]);return Object(o.b)(s,Object(i.a)({},c,n,{components:t,mdxType:"MDXLayout"}),Object(o.b)("p",null,"To use ",Object(o.b)("inlineCode",{parentName:"p"},"mikro-orm")," with mongo database, do not forget to install ",Object(o.b)("inlineCode",{parentName:"p"},"mongodb")," dependency. As ",Object(o.b)("inlineCode",{parentName:"p"},"MongoDriver"),"\nis the default one, you do not need to provide it."),Object(o.b)("p",null,"Then call ",Object(o.b)("inlineCode",{parentName:"p"},"MikroORM.init")," as part of bootstrapping your app:"),Object(o.b)("pre",null,Object(o.b)("code",Object(i.a)({parentName:"pre"},{className:"language-typescript"}),"const orm = await MikroORM.init({\n  entitiesDirs: ['entities'], // relative to `baseDir`\n  dbName: 'my-db-name',\n  clientUrl: '...',\n});\n")),Object(o.b)("h2",{id:"defining-entity"},"Defining entity"),Object(o.b)("p",null,"When defining entity, do not forget to define primary key like this:"),Object(o.b)("pre",null,Object(o.b)("code",Object(i.a)({parentName:"pre"},{className:"language-typescript"}),"@PrimaryKey()\n_id: ObjectID;\n")),Object(o.b)("h2",{id:"objectid-and-string-id-duality"},"ObjectID and string id duality"),Object(o.b)("p",null,"Every entity has both ",Object(o.b)("inlineCode",{parentName:"p"},"ObjectID")," and ",Object(o.b)("inlineCode",{parentName:"p"},"string")," id available, also all methods of ",Object(o.b)("inlineCode",{parentName:"p"},"EntityManager"),"\nand ",Object(o.b)("inlineCode",{parentName:"p"},"EntityRepository")," supports querying by both of them. "),Object(o.b)("pre",null,Object(o.b)("code",Object(i.a)({parentName:"pre"},{className:"language-typescript"}),"const author = orm.em.getReference('...id...');\nconsole.log(author.id);  // returns '...id...'\nconsole.log(author._id); // returns ObjectID('...id...')\n\n// all of those will return the same results\nconst article = '...article id...'; // string id\nconst book = '...book id...'; // string id\nconst repo = orm.em.getRepository(Author);\nconst foo1 = await repo.find({ id: { $in: [article] }, favouriteBook: book });\nconst bar1 = await repo.find({ id: { $in: [new ObjectID(article)] }, favouriteBook: new ObjectID(book) });\nconst foo2 = await repo.find({ _id: { $in: [article] }, favouriteBook: book });\nconst bar2 = await repo.find({ _id: { $in: [new ObjectID(article)] }, favouriteBook: new ObjectID(book) });\n")),Object(o.b)("h2",{id:"manytomany-collections-with-inlined-pivot-array"},"ManyToMany collections with inlined pivot array"),Object(o.b)("p",null,"As opposed to SQL drivers that use pivot tables, in mongo we can leverage available array type\nto store array of collection items (identifiers). This approach has two main benefits:"),Object(o.b)("ol",null,Object(o.b)("li",{parentName:"ol"},"Collection is stored on owning side entity, so we know how many items are there even before\ninitializing the collection."),Object(o.b)("li",{parentName:"ol"},"As there are no pivot tables, resulting database queries are much simpler.")),Object(o.b)("h2",{id:"native-collection-methods"},"Native collection methods"),Object(o.b)("p",null,"Sometimes you need to perform some bulk operation, or you just want to populate your\ndatabase with initial fixtures. Using ORM for such operations can bring unnecessary\nboilerplate code. In this case, you can use one of ",Object(o.b)("inlineCode",{parentName:"p"},"nativeInsert/nativeUpdate/nativeDelete"),"\nmethods:"),Object(o.b)("pre",null,Object(o.b)("code",Object(i.a)({parentName:"pre"},{className:"language-typescript"}),"EntityManager.nativeInsert<T extends IEntity>(entityName: string, data: any): Promise<IPrimaryKey>;\nEntityManager.nativeUpdate<T extends IEntity>(entityName: string, where: FilterQuery<T>, data: any): Promise<number>;\nEntityManager.nativeDelete<T extends IEntity>(entityName: string, where: FilterQuery<T> | any): Promise<number>;\n")),Object(o.b)("p",null,"Those methods execute native driver methods like Mongo's ",Object(o.b)("inlineCode",{parentName:"p"},"insertOne/updateMany/deleteMany")," collection methods respectively.\nThis is common interface for all drivers, so for MySQL driver, it will fire native SQL queries.\nKeep in mind that they do not hydrate results to entities, and they do not trigger lifecycle hooks. "),Object(o.b)("p",null,"They are also available as ",Object(o.b)("inlineCode",{parentName:"p"},"EntityRepository")," shortcuts:"),Object(o.b)("pre",null,Object(o.b)("code",Object(i.a)({parentName:"pre"},{className:"language-typescript"}),"EntityRepository.nativeInsert(data: any): Promise<IPrimaryKey>;\nEntityRepository.nativeUpdate(where: FilterQuery<T>, data: any): Promise<number>;\nEntityRepository.nativeDelete(where: FilterQuery<T> | any): Promise<number>;\n")),Object(o.b)("p",null,"There is also shortcut for calling ",Object(o.b)("inlineCode",{parentName:"p"},"aggregate")," method:"),Object(o.b)("pre",null,Object(o.b)("code",Object(i.a)({parentName:"pre"},{className:"language-typescript"}),"EntityManager.aggregate(entityName: string, pipeline: any[]): Promise<any[]>;\nEntityRepository.aggregate(pipeline: any[]): Promise<any[]>;\n")),Object(o.b)("p",null,Object(o.b)("a",Object(i.a)({parentName:"p"},{href:"/docs/v2/index#table-of-contents"}),"\u2190"," Back to table of contents")))}p.isMDXComponent=!0},290:function(e,t,n){"use strict";n.d(t,"a",(function(){return l})),n.d(t,"b",(function(){return b}));var i=n(0),a=n.n(i),o=a.a.createContext({}),r=function(e){var t=a.a.useContext(o),n=t;return e&&(n="function"==typeof e?e(t):Object.assign({},t,e)),n},l=function(e){var t=r(e.components);return a.a.createElement(o.Provider,{value:t},e.children)};var c="mdxType",s={inlineCode:"code",wrapper:function(e){var t=e.children;return a.a.createElement(a.a.Fragment,{},t)}},p=Object(i.forwardRef)((function(e,t){var n=e.components,i=e.mdxType,o=e.originalType,l=e.parentName,c=function(e,t){var n={};for(var i in e)Object.prototype.hasOwnProperty.call(e,i)&&-1===t.indexOf(i)&&(n[i]=e[i]);return n}(e,["components","mdxType","originalType","parentName"]),p=r(n),b=i,d=p[l+"."+b]||p[b]||s[b]||o;return n?a.a.createElement(d,Object.assign({},{ref:t},c,{components:n})):a.a.createElement(d,Object.assign({},{ref:t},c))}));function b(e,t){var n=arguments,i=t&&t.mdxType;if("string"==typeof e||i){var o=n.length,r=new Array(o);r[0]=p;var l={};for(var s in t)hasOwnProperty.call(t,s)&&(l[s]=t[s]);l.originalType=e,l[c]="string"==typeof e?e:i,r[1]=l;for(var b=2;b<o;b++)r[b]=n[b];return a.a.createElement.apply(null,r)}return a.a.createElement.apply(null,n)}p.displayName="MDXCreateElement"}}]);