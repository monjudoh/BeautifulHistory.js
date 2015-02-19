define('BeautifulHistory',
[
  'BeautifulProperties',
  'NamespacedWebStorage',
  'RecoveryStorage',
  'underscore',
  'module'
],
function (
          BeautifulProperties,
          NamespacedWebStorage,
          RecoveryStorage,
          _,
          module
) {


  var config = module.config();
  var initOptions = config.initOptions || Object.create(null);
  function compareSemver(semver,operator,otherSemver) {
    if (typeof semver === 'string') {
      semver = semver.split('.').map(function (str) {
        return Number(str)
      });
    }
    if (typeof otherSemver === 'string') {
      otherSemver = otherSemver.split('.').map(function (str) {
        return Number(str)
      });
    }
    "use strict";
    switch (operator) {
      case '==':
      case '===':
        return semver[0] === otherSemver[0] && semver[1] === otherSemver[1] && semver[2] === otherSemver[2];
      case '>':
      case '<':
        return eval(('semver[0] OP otherSemver[0] ||'+
        '(semver[0] === otherSemver[0] && semver[1] OP otherSemver[1]) ||'+
        '(semver[0] === otherSemver[0] && semver[1] === otherSemver[1] && semver[2] OP otherSemver[2])').replace(/OP/g,operator));
      case '>=':
      case '<=':
        return eval(('semver[0] OP otherSemver[0] ||'+
        '(semver[0] === otherSemver[0] && semver[1] OP otherSemver[1]) ||'+
        '(semver[0] === otherSemver[0] && semver[1] === otherSemver[1] && semver[2] OP= otherSemver[2])').replace(/OP/g,operator.replace('=','')));
    }
  }

  if (compareSemver(BeautifulProperties.VERSION,'>=',[0,2,0])) {
    throw new Error('BeautifulProperties 0.2.0 or above is not supported.');
  }

  /**
   * @namespace BeautifulHistory
   * @version 0.0.3
   * @author monjudoh
   * @copyright <pre>(c) 2013 monjudoh
   * Dual licensed under the MIT (MIT-LICENSE.txt)
   * and GPL (GPL-LICENSE.txt) licenses.</pre>
   * @see https://github.com/monjudoh/BeautifulHistory.js
   */
  var BeautifulHistory = Object.create(null);
  BeautifulProperties.Events.provideMethods(BeautifulHistory);
  BeautifulProperties.Hookable.Get.provideMethods(BeautifulHistory);

  /**
   * @name debug
   * @memberOf BeautifulHistory
   * @type boolean
   * @description trueならlog出力を行う。
   */
  BeautifulHistory.debug = !!config.debug || false;

  /**
   * @name isSupported
   * @memberOf BeautifulHistory
   * @type boolean
   * @description 現在使用されている環境でBeautifulHistoryが使用可能であればtrue,不能であればfalse
   */
  BeautifulProperties.LazyInitializable.define(BeautifulHistory,'isSupported',{
    init:function(){
      var originalState = history.state;
      var now = Date.now();
      history.replaceState(now,null);
      try {
        return now === history.state;
      } finally {
        history.replaceState(originalState,null);
      }
    }
  });

  /**
   * @name currentIndex
   * @memberOf BeautifulHistory
   * @type number
   * @description history上でinitial setUp位置を0とした現在位置の相対位置
   */
  BeautifulProperties.Hookable.define(BeautifulHistory,'currentIndex',{
    get : function () {
      return (history.state || {index:-1}).index;
    }
  });
  BeautifulProperties.Observable.define(BeautifulHistory,'currentIndex');
  /**
   * @name maxIndex
   * @memberOf BeautifulHistory
   * @type number
   * @description <pre>BeautifulHistoryで管理されているhistoryの最後尾の、initial setUp位置を0とした相対位置
   * 未初期化時は-1を返す。</pre>
   */
  BeautifulProperties.Hookable.define(BeautifulHistory,'maxIndex',{
    get : function () {
      return this.controllers.length - 1;
    }
  });
  BeautifulProperties.Observable.define(BeautifulHistory,'maxIndex');
  /**
   * @name historyId
   * @memberOf BeautifulHistory
   * @type number
   * @description BeautifulHistoryで管理されている範囲のhistoryを指すID。<br/>
   * history.stateに保存されるため、history.stateが消えない限り同じ値になる。<br/>
   * 例えばリロードしても保持される。
   */
  Object.defineProperty(BeautifulHistory,'historyId',{
    writable:true
  });
  /**
   * @name historySpecifiedStorage
   * @memberOf BeautifulHistory
   * @type NamespacedWebStorage
   * @description historyId毎に独立したstorage
   */
  BeautifulProperties.LazyInitializable.define(BeautifulHistory,'historySpecifiedStorage',{
    init:function(){
      if (this.historyId === undefined) {
        throw Error('historyId未初期化でhistorySpecifiedStorageは使用できません');
      }
      return new NamespacedWebStorage('BeautifulHistory',['historySpecified',this.historyId],sessionStorage);
    }
  });
  BeautifulHistory.controllers = [];
  BeautifulHistory.types = Object.create(null);
  BeautifulHistory.duringSilentOperation = false;
  var popstateHandlers = [];

  /**
   * @function BeautifulHistory~onPopstate
   * @param {function} handler
   * @description handlerをwindowにpopstate eventとして登録する。
   * @private
   */
  function onPopstate(handler) {
    if (popstateHandlers.indexOf(handler) !== -1) {
      return;
    }
    window.addEventListener('popstate',handler,false);
    popstateHandlers.push(handler);
  }
  /**
   * @function BeautifulHistory~offPopstate
   * @param {function=} handler
   * @description <pre>windowにpopstate eventとして登録されたhandlerを削除する。
   * handler未指定の場合はBeautifulHistory~onPopstateで登録済みのhandlerを全て削除する。</pre>
   * @private
   */
  function offPopstate(handler) {
    // all
    if (!handler) {
      popstateHandlers.forEach(function (handler) {
        window.removeEventListener('popstate', handler, false);
      });
      popstateHandlers.length = 0;
      return;
    }
    var index = popstateHandlers.indexOf(handler);
    // no bound handler.
    if (index === -1) {
      return;
    }
    window.removeEventListener('popstate', handler, false);
    popstateHandlers.slice(index,1);
  }
  /**
   * @callback BeautifulHistory~factory
   * @param {*=} parentController push元のcontroller
   * @param {*=} options
   * @description controllerを作成する処理
   */
  /**
   * @callback BeautifulHistory~show
   * @param {*=} controller
   * @param {*=} options
   * @description controllerに紐づくUIコンポーネントを表示する処理
   */
  /**
   * @callback BeautifulHistory~hide
   * @param {*=} controller
   * @param {*=} options
   * @description controllerに紐づくUIコンポーネントを非表示にする処理
   */
  /**
   * @function register
   * @memberOf BeautifulHistory
   *
   * @param {string} type
   * @param {{factory:BeautifulHistory~factory,show:BeautifulHistory~show,hide:BeautifulHistory~hide}} desc
   * @description BeautifulHistoryで管理するcontrollerのtypeを登録する。登録したtypeはpush/replaceで使用できる。
   */
  BeautifulHistory.register = function register(type,desc) {
    var manager = this;
    if (manager.debug) {
      console.info('BeautifulHistory.register(type,desc)',type,desc);
    }
    desc = _.defaults(_.clone(desc),{
      factory : function (parentController,options) {
      },
      show :function (controller,options) {
      },
      hide : function (controller,options) {
      }
    });
    BeautifulHistory.types[type] = desc;
  };
  /**
   * @function setUp
   * @memberOf BeautifulHistory
   *
   * @param {{namespace:string,whenBrowserRestart:string,redirectHtmlUrl:string=}} options
   * @returns {Promise}
   * @description <pre>
   * あるnamespaceでsetUpした後にブラウザ再起動をし初めて同一namespaceでsetUpしたとき、
   * すなわちHistoryManagerで履歴を管理していたタブがブラウザ再起動によって再度開かれたときの動作はwhenBrowserRestartによって決定される。
   *   backToPreviousDocument:HistoryManagerで履歴を管理していたdocumentに遷移してくる直前のdocumentまで戻る
   *   redirect              :redirect用HTMLを使ったハックで履歴を消してリロードする
   *   none                  :何もしない
   *
   * - redirectHtmlUrl
   * - storageTruncate
   * </pre>
   */
  BeautifulHistory.setUp = function setUp(options){
    options = _.defaults(_.clone(options),initOptions);
    var manager = this;
    if (manager.debug) {
      console.info('BeautifulHistory.setUp(options)',options);
    }
    var recoveryStorage = new RecoveryStorage('BeautifulHistory',['recovery',options.namespace]);
    var storage = new NamespacedWebStorage('BeautifulHistory',['session',options.namespace],sessionStorage);
    var storageTruncate = options.storageTruncate;
    recoveryStorage.truncate(storageTruncate,2);
    storage.truncate(storageTruncate,2);
    var headResolver;
    var promise = new Promise(function(resolve,reject){
      headResolver = resolve;
    });
    promise = promise.then(function(type){
      if (manager.debug) {
        console.log('BeautifulHistory.setUp type',type);
      }
      // タブを閉じた場合・戻るボタンで一度に別ページまで遷移した場合はcurrentIndexの記録を削除する
      // ブラウザ再起動後にこのページが開かれるのは、起動直後ではなくて別ページからの遷移であるはずなので
      function unload(ev){
        recoveryStorage.removeItem('currentIndex');
        window.removeEventListener('unload',unload,false);
      }
      window.addEventListener('unload',unload,false);
      manager.on('change:currentIndex',function(ev,currentIndex){
        recoveryStorage.setItem('currentIndex',currentIndex);
        storage.setItem('historyLength',history.length);
      });
      recoveryStorage.setItem('currentIndex',manager.currentIndex);
      recoveryStorage.setItem('maxIndex',manager.maxIndex);
      recoveryStorage.truncate(storageTruncate,2);
      storage.truncate(storageTruncate,2);
      manager.historySpecifiedStorage.setItem('maxIndex',manager.maxIndex);
      manager.on('change:maxIndex',function(ev,maxIndex){
        this.historySpecifiedStorage.setItem('maxIndex',maxIndex);
        recoveryStorage.setItem('maxIndex',maxIndex);
      });
      return Promise.resolve(type);
    });

    // ブラウザリロード時
    if (history.state) {
      // リストア
      (function () {
        manager.duringSilentOperation = true;
        manager.historyId = history.state.historyId;
        var index = history.state.index;
        var maxIndex = manager.historySpecifiedStorage.getItem('maxIndex') || index;
        if (manager.debug) {
          console.info('BeautifulHistory.setUp restore (index,maxIndex)',index,maxIndex);
        }
        function handler(ev){
          var state = history.state;
          var type = state.type;
          var options = state.options;
          if (manager.debug) {
            console.info('BeautifulHistory.setUp restore popstate (state.index,state,type,options,ev)',state.index,state,type,options,ev);
          }
          manager.controllers[state.index] = manager.createInfo(type, state.index, options);
          if (state.index === maxIndex) {
            offPopstate(handler);
            manager.duringSilentOperation = false;
            manager.go(index).then(function(){
              headResolver('restore');
            });
            return;
          }
          setTimeout(function(){
            history.forward();
          },16);
        }
        if (maxIndex !== 0) {
          onPopstate(handler);
          if (index !== 0) {
            history.go(-index);
          } else {
            handler();
          }
        } else {
          // 動かさない
          handler();
        }
      })();
      return promise;
    }
    if (manager.debug) {
      console.log("BeautifulHistory.setUp recoveryStorage.getItem('currentIndex'),recoveryStorage.getItem('maxIndex')",recoveryStorage.getItem('currentIndex'),recoveryStorage.getItem('maxIndex'));
    }
    // ブラウザ再起動直後
    if (!history.state && recoveryStorage.getItem('currentIndex') !== undefined) {
      (function () {
        manager.duringSilentOperation = true;
        var index = recoveryStorage.getItem('currentIndex');
        recoveryStorage.removeItem('currentIndex');
        var maxIndex = recoveryStorage.getItem('maxIndex');
        maxIndex = maxIndex !== undefined ? maxIndex : index;
        recoveryStorage.removeItem('maxIndex');
        function resolve(){
          headResolver('browserRestart');
        }
        function goHandler(ev){
          if (ev) {
            offPopstate(goHandler);
          }
          manager.replace('empty',null,false,true);
          if (maxIndex !== 0) {
            onPopstate(resolve);
            manager.duringSilentOperation = false;
            manager.push('forceBack');
          } else {
            manager.duringSilentOperation = false;
            resolve();
          }
        }
        if (index !== 0) {
          switch (options.whenBrowserRestart) {
            case 'backToPreviousDocument':
              manager.backToPreviousDocument(false);
              break;
            case 'redirect':
              (function () {
                function handler(){
                  offPopstate(handler);
                  var url = (function () {
                    var path_hash = location.href.replace(new RegExp('^'+location.origin),'');
                    var json = JSON.stringify([
                      {
                        type:'replace',
                        commands:[
                          {
                            type:'back',
                            length:2
                          }
                        ]
                      },
                      {
                        type:'redirect',
                        path_hash:path_hash
                      }
                    ]);
                    return options.redirectHtmlUrl + '#' + btoa(json);
                  })();
                  // index:0までhistory.goした後にpopstateのeventhandler内でlocation.hrefを書き換えているのだが、以下のような問題が発生することがある。
                  // 1. go前のindex:nの位置がredirect.htmlのURLに書き換えられる
                  // 2. index:0に移動する
                  // 3. index:0でredirect.htmlが読み込まれる(が、履歴上でのURLは書き換え前のまま)
                  // そこで、setTimeoutを入れたところ発生しなくなった。
                  setTimeout(function(){
                    location.href = url;
                  },16);
                }
                onPopstate(handler);
                history.go(-index);
              })();
              break;
            case 'none':
              manager.historyId = Date.now();
              resolve();
              break;
            default :
              break;
          }
        } else {
          manager.historyId = Date.now();
          goHandler();
        }
      })();
      return promise;
    }

    // whenBrowserRestart:'redirect'でskipされた所にforwardで戻ってきてしまった場合
    if (!history.state && storage.getItem('historyLength') === history.length) {
      (function () {
        manager.historyId = Date.now();
        manager.replace('empty',null,false,true);
        function resolve() {
          headResolver('initial');
        }
        onPopstate(resolve);
        manager.duringSilentOperation = false;
        manager.push('forceBack');
      })();
      return promise;
    }

    // 外部からの遷移直後
    if (!history.state) {
      (function () {
        manager.historyId = Date.now();
        manager.replace('empty',null,false,true);
        headResolver('initial');
      })();
      return promise;
    }
    // なし
  };
  /**
   * @function replace
   * @memberOf BeautifulHistory
   *
   * @param {string} type
   * @param {*=} options
   * @param {boolean=} silently trueの場合はinfoとstateの書き換えのみ行い表示には反映させない。未指定の場合はfalse。
   * @param {boolean=} initialize 初期化の場合trueを指定する。基本的にアプリケーションコードでは使わない。
   * @description this.currentIndex(初期化の場合は0)の位置のcontrollerを指定したtype/optionsのものに置き換える。<br/>
   * replace元とtypeが同じ場合は保存されたoptionsを置き換えるだけでcontrollerの再作成はしない。<br/>
   * 未表示の場合は表示する。
   */
  BeautifulHistory.replace = function replace(type,options,silently,initialize) {
    silently = silently !== undefined ? silently : false;
    initialize = initialize !== undefined ? initialize : false;
    var manager = this;
    if (manager.debug) {
      console.info('BeautifulHistory.replace(type,options)', type, options);
    }
    var index = initialize ? 0 : this.currentIndex;
    var info = this.controllers[index];
    // replace元とtypeが同じ場合のみ再利用する
    var isReuse = info && info.type === type;
    if (isReuse) {
      info.options = options;
    } else {
      info = this.createInfo(type, index, options);
    }
    if (!info.isShown && !silently) {
      var controller = info.controller;
      var showCallback = manager.types[type].show;
      showCallback(controller,options);
      info.isShown = true;
      if (!isReuse) {
        this.controllers[index] = info;
      }
      manager.trigger('show',type,controller);
    }
    history.replaceState(manager.convertInfoToState(info,index),null);
  };
  /**
   * @function push
   * @memberOf BeautifulHistory
   *
   * @param {string} type
   * @param {*=} options
   * @description currentIndexの次の位置に新しいcontrollerを追加する。
   */
  BeautifulHistory.push = function push(type,options) {
    var manager = this;
    if (manager.debug) {
      console.info('BeautifulHistory.push(type,options)', type, options);
    }
    // controllersのcurrentIndex以降をtruncateする
    this.controllers.length = this.currentIndex + 1;
    var index = this.currentIndex + 1;
    var info = this.createInfo(type, index, options, {isShown: true});
    this.controllers.push(info);
    history.pushState(this.convertInfoToState(info,index),null);
    BeautifulProperties.Hookable.Get.refreshProperty(BeautifulHistory,'currentIndex');
    BeautifulProperties.Hookable.Get.refreshProperty(BeautifulHistory,'maxIndex');
  };

  /**
   * @function go
   * @memberOf BeautifulHistory
   *
   * @param {number} index 遷移先index
   * @param {boolean=} silently デフォルト値false
   * @returns {Promise}
   */
  BeautifulHistory.go = function go(index,silently) {
    silently = silently !== undefined ? silently : false;
    var manager = this;
    if (manager.debug) {
      console.info('BeautifulHistory.go(index,silently)',index,silently);
    }
    var currentIndex = manager.getSilently('currentIndex');
    if (currentIndex === index) {
      return Promise.resolve();
    }
    if (silently) {
      manager.duringSilentOperation = true;
    }
    var resolve;
    var promise = new Promise(function(resolve_,reject){
      resolve = resolve_;
    });
    function handler(){
      offPopstate(handler);
      if (silently) {
        manager.duringSilentOperation = false;
      }
      resolve();
    }
    onPopstate(handler);
    history.go(index - currentIndex);
    return promise;
  };
  onPopstate(function(ev){
    var manager = BeautifulHistory;
    if (manager.debug) {
      console.log('BeautifulHistory popstate ev.state,history.state,manager.duringSilentOperation',ev.state,history.state,manager.duringSilentOperation);
    }
    if (manager.duringSilentOperation) {
      return;
    }
    BeautifulProperties.Hookable.Get.refreshProperty(BeautifulHistory,'currentIndex');
  });
  /**
   * @function collapse
   * @memberOf BeautifulHistory
   *
   * @param {number} startIndex
   * @param {number} endIndex
   * @returns {Promise}
   * @description historyの圧縮を行う。<br/>
   * startIndex〜endIndexの履歴をendIndex1個に置き換える。<br/>
   * endIndexが末尾の場合は一つ前に即座に戻るforceBackをpushしておく。<br/>
   * 圧縮後、圧縮前のcurrentIndexに対応するindexに移動する。
   */
  BeautifulHistory.collapse = function collapse(startIndex,endIndex) {
    var resolve;
    var promise = new Promise(function(resolve_,reject){
      resolve = resolve_;
    });
    var manager = this;
    if (manager.debug) {
      console.info('BeautifulHistory.collapse(startIndex, endIndex)', startIndex, endIndex);
    }
    var currentIndex = this.currentIndex;
    var indexAfterCollapse;
    if (currentIndex < startIndex) {
      indexAfterCollapse = currentIndex
    } else if(currentIndex > endIndex) {
      indexAfterCollapse = currentIndex - endIndex + startIndex;
    } else {
      indexAfterCollapse = startIndex;
    }
    manager.duringSilentOperation = true;
    manager.controllers.splice(startIndex,(endIndex - startIndex));
    onPopstate(didBackToStartIndex);
    history.go(startIndex - currentIndex);

    function didBackToStartIndex(ev){
      offPopstate(didBackToStartIndex);
      (function (info) {
        history.replaceState(manager.convertInfoToState(info,startIndex),null);
      })(manager.controllers[startIndex]);
      if (manager.controllers.length === startIndex + 1) {
        // 後続はない
        manager.duringSilentOperation = false;
        onPopstate(didPopFromForceBack);
        manager.push('forceBack');
        return;
      }
      push();
    }
    function didPopFromForceBack(ev){
      offPopstate(didPopFromForceBack);
      BeautifulProperties.Hookable.Get.refreshProperty(BeautifulHistory,'maxIndex');
      setTimeout(resolve,16);
    }
    function push(){
      var currentIndex = manager.getSilently('currentIndex');
      if (manager.debug) {
        console.log('BeautifulHistory.collapse push() currentIndex',currentIndex);
      }

      var nextIndex = currentIndex + 1;
      if (manager.controllers.length === nextIndex) {
        // 後続はない
        manager.duringSilentOperation = false;
        resolve();
        return;
      }
      (function (info) {
        history.pushState(manager.convertInfoToState(info,nextIndex),null);
      })(manager.controllers[nextIndex]);
      push();
    }

    return promise.then(function done(){
      return manager.go(indexAfterCollapse);
    });
  };
  /**
   * @name existsPreviousDocument
   * @memberOf BeautifulHistory
   * @type boolean 前のdocumentが存在しているならtrue、存在しないことが分かっているか不明ならfalse
   * @description <pre>現documentに遷移してくる前のdocumentが存在しているかどうか
   * なお、現在の実装では次documentが存在している場合は正確に判定できない。
   * </pre>
   */
  Object.defineProperty(BeautifulHistory,'existsPreviousDocument',{
    get:function(){
      var maxIndex = BeautifulHistory.getSilently('maxIndex');
      // 未初期化時にはPreviousDocument
      if (maxIndex === -1) {
        return false;
      }
      // これらが同値ならPreviousDocumentは存在しない
      return history.length !== (BeautifulHistory.maxIndex + 1);
    }
  });
  /**
   * @function backToPreviousDocument
   * @memberOf BeautifulHistory
   * @param {boolean=} useCurrentIndex default:true
   * @description <pre>現documentに遷移してくる前のdocumentまで戻る
   * useCurrentIndex===true  : currentIndex前が現documentの最初だと言えるのでcurrentIndex + 1戻る
   * useCurrentIndex===false : 前documentまで戻り現documentから抜けるとcontextが変わり、現documentのJSは実行されなくなるはずなので、
   *                           popstate eventで再帰的に戻っていくと前documentに戻るまで実行されることが期待されるので、そのようにする。
   * </pre>
   */
  BeautifulHistory.backToPreviousDocument = function backToPreviousDocument(useCurrentIndex){
    useCurrentIndex = useCurrentIndex !== undefined ? useCurrentIndex : true;
    if (useCurrentIndex) {
      var currentIndex = BeautifulHistory.getSilently('currentIndex');
      if (currentIndex >= 0) {
        offPopstate();
        history.go(-(currentIndex + 1));
      }
    } else {
      offPopstate();
      onPopstate(function(){
        history.back();
      });
      history.back();
    }
  };
  BeautifulHistory.createInfo = function createInfo(type, index, options, override){
    override = override || Object.create(null);
    var callbacks = this.types[type];
    var parentController = null;
    if (index >= 1) {
      parentController = this.controllers[index - 1].controller;
    }
    var controller = (callbacks.factory)(parentController,options);
    var info = {controller:controller,type:type,options:options,isShown:false};
    Object.keys(override).forEach(function(key){
      info[key] = override[key];
    });
    return info;
  };
  BeautifulHistory.convertInfoToState = function convertInfoToState(info,index) {
    return {
      type:info.type,
      options:info.options,
      index:index,
      historyId:this.historyId
    }
  };
  BeautifulHistory.on('change:currentIndex',function(ev,currentIndex,previousIndex){
    var manager = this;
    if (manager.debug) {
      console.log('change:currentIndex(decrement) currentIndex, previousIndex',currentIndex, previousIndex);
    }
    if (currentIndex === -1 || previousIndex === undefined || currentIndex >= previousIndex) {
      return;
    }
    // 減った
    var range = _.range(currentIndex + 1, previousIndex + 1).reverse();
    if (manager.debug) {
      console.log('change:currentIndex(decrement) range',range);
    }
    range.map(function(index){
      return BeautifulHistory.controllers[index];
    }).forEach(function(info,index){
      index = range[index];
      if (manager.debug) {
        console.log('change:currentIndex(decrement) info, index', _.clone(info), index);
      }
      if (!info || !info.isShown) {
        return;
      }
      var hideCallback = (BeautifulHistory.types[info.type].hide);
      var options = info.options;
      hideCallback(info.controller,options);
      info.isShown = false;
    });
  });
  BeautifulHistory.on('change:currentIndex',function(ev,currentIndex,previousIndex){
    var manager = this;
    if (manager.debug) {
      console.log('change:currentIndex(increment) currentIndex, previousIndex',currentIndex, previousIndex);
    }
    previousIndex = previousIndex || 0;
    if (currentIndex < previousIndex) {
      return;
    }
    // 増えた
    var range = _.range(previousIndex + 1,currentIndex + 1);
    if (manager.debug) {
      console.log('change:currentIndex(increment) range',range);
    }
    range.map(function(index){
      return BeautifulHistory.controllers[index];
    }).forEach(function(info,index){
      index = range[index];
      if (manager.debug) {
        console.log('change:currentIndex(increment) info, index',info, index);
      }
      if (!info) {
        return;
      }
      var showCallback = manager.types[info.type].show;
      var options = info.options;
      showCallback(info.controller,options);
      info.isShown = true;
      manager.trigger('show',info.type,info.controller);
    });
  });

  BeautifulHistory.on('show',function onShow(ev,type,controller){
    this.trigger('show:'+type,controller);
  });

  BeautifulHistory.register('empty',{});
  BeautifulHistory.register('forceBack',{
    show :function (controller,options) {
      history.back();
    }
  });
  return BeautifulHistory;
});