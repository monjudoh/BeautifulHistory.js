/*
 * BeautifulHistory.js
 *
 * https://github.com/monjudoh/BeautifulHistory.js
 * version: 0.0.1
 *
 * Copyright (c) 2013 monjudoh
 * Dual licensed under the MIT (MIT-LICENSE.txt)
 * and GPL (GPL-LICENSE.txt) licenses.
 */
/**
 * @module BeautifulHistory
 * @version 0.0.1
 * @author monjudoh
 * @copyright (c) 2013 monjudoh<br/>
 * Dual licensed under the MIT (MIT-LICENSE.txt)<br/>
 * and GPL (GPL-LICENSE.txt) licenses.
 * @see https://github.com/monjudoh/BeautifulHistory.js
 * @see BeautifulHistory
 */
define('BeautifulHistory',
[
  'BeautifulProperties',
  'NamespacedWebStorage',
  'RecoveryStorage',
  'underscore',
  'jquery',
  'module'
],
function (
          BeautifulProperties,
          NamespacedWebStorage,
          RecoveryStorage,
          _,
          $,
          module
) {


  var config = module.config();
  var initOptions = config.initOptions || Object.create(null);

  /**
   * @name BeautifulHistory
   * @namespace
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
   * @description BeautifulHistoryで管理されているhistoryの最後尾の、initial setUp位置を0とした相対位置
   */
  BeautifulProperties.Hookable.define(BeautifulHistory,'maxIndex',{
    get : function () {
      return this.controllers.length - 1;
    }
  });
  BeautifulProperties.Observable.define(BeautifulHistory,'maxIndex');
  BeautifulHistory.on('change:maxIndex',function(ev,maxIndex){
    this.historySpecifiedStorage.setItem('maxIndex',maxIndex);
  });
  /**
   * @name historyId
   * @memberOf BeautifulHistory
   * @type number
   * @description BeautifulHistoryで管理されている範囲のhistoryを指すID。<br/>
   * history.stateに保存されるため、history.stateが消えない限り同じ値になる。<br/>
   * 例えばリロードしても保持される。
   */
  BeautifulProperties.LazyInitializable.define(BeautifulHistory,'historyId',{
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
  /**
   * @name register
   * @memberOf BeautifulHistory
   * @function
   *
   * @param type
   * @param desc
   */
  BeautifulHistory.register = function register(type,desc) {
    var manager = this;
    if (manager.debug) {
      console.info('BeautifulHistory.register(type,desc)',type,desc);
    }
    desc = _.defaults(_.clone(desc),{
      factory : function (options) {
      },
      show :function (controller,options) {
      },
      hide : function (controller,options) {
      }
    });
    BeautifulHistory.types[type] = desc;
  };
  /**
   * @name setUp
   * @memberOf BeautifulHistory
   * @function
   *
   * @param {{namespace:string,whenBrowserRestart:string,redirectHtmlUrl:string=}} options
   * @returns {promise}
   * @description <br/>
   * あるnamespaceでsetUpした後にブラウザ再起動をし初めて同一namespaceでsetUpしたとき、<br/>
   * すなわちHistoryManagerで履歴を管理していたタブがブラウザ再起動によって再度開かれたときの動作はwhenBrowserRestartによって決定される。<br/>
   *   backToPreviousDocument:HistoryManagerで履歴を管理していたdocumentに遷移してくる直前のdocumentまで戻る<br/>
   *   redirect              :redirect用HTMLを使ったハックで履歴を消してリロードする<br/>
   *   none                  :何もしない<br/>
   * <br/>
   * - redirectHtmlUrl<br/>
   * - storageTruncate
   *
   */
  BeautifulHistory.setUp = function setUp(options){
    options = _.defaults(_.clone(options),initOptions);
    var currentIndexKey = 'currentIndex';
    var headDfd = $.Deferred();
    var dfd = headDfd;
    var manager = this;
    if (manager.debug) {
      console.info('BeautifulHistory.setUp(options)',options);
    }
    var storage = new RecoveryStorage('BeautifulHistory',['recovery',options.namespace]);
    var storageTruncate = options.storageTruncate;
    storage.truncate(storageTruncate,2);
    dfd = dfd.then(function(type){
      var dfd = $.Deferred();
      // タブを閉じた場合・戻るボタンで一度に別ページまで遷移した場合はcurrentIndexの記録を削除する
      // ブラウザ再起動後にこのページが開かれるのは、起動直後ではなくて別ページからの遷移であるはずなので
      $(window).on('unload',function(ev){
        storage.removeItem(currentIndexKey);
      });
      manager.on('change:currentIndex',function(ev,currentIndex){
        storage.setItem(currentIndexKey,currentIndex);
      });
      storage.setItem(currentIndexKey,manager.currentIndex);
      storage.truncate(storageTruncate,2);
      return dfd.resolve(type).promise();
    });

    // ブラウザリロード時
    if (history.state) {
      // リストア
      (function () {
        manager.duringSilentOperation = true;
        manager.historyId = history.state.historyId;
        var index = history.state.index;
        var maxIndex = manager.historySpecifiedStorage.getItem('maxIndex') || index;
        function handler(ev){
          var state = history.state;
          var type = state.type;
          var options = state.options;
          manager.controllers[state.index] = manager.createInfo(type, options);
          if (state.index === maxIndex) {
            if (ev) {
              $(window).off('popstate', handler);
            }
            manager.duringSilentOperation = false;
            manager.go(index).then(function(){
              headDfd.resolve('restore');
            });
            return;
          }
          setTimeout(function(){
            history.forward();
          },16);
        }
        if (index !== 0) {
          $(window).on('popstate',handler);
          history.go(-index);
        } else {
          handler();
        }
      })();
      return dfd.promise();
    }
    // ブラウザ再起動直後
    if (manager.debug) {
      console.log('BeautifulHistory.setUp storage.getItem(currentIndexKey)',storage.getItem(currentIndexKey));
    }
    if (!history.state && storage.getItem(currentIndexKey) !== undefined) {
      (function () {
        manager.duringSilentOperation = true;
        var index = storage.getItem(currentIndexKey);
        function backHandler(){
          headDfd.resolve('browserRestart');
        }
        function goHandler(ev){
          if (ev) {
            $(window).off('popstate', goHandler);
          }
          storage.removeItem(currentIndexKey);
          manager.replace('empty',null,0);
          $(window).on('popstate',backHandler);
          manager.duringSilentOperation = false;
          manager.push('forceBack');
        }
        if (index !== 0) {
          storage.removeItem(currentIndexKey);
          switch (options.whenBrowserRestart) {
            case 'backToPreviousDocument':
              manager.backToPreviousDocument();
              break;
            case 'redirect':
              (function () {
                function handler(){
                  var path_hash = location.href.replace(new RegExp('^'+location.origin),'');
                  var json = JSON.stringify({
                    path_hash:path_hash,
                    command:'redirect',
                    replace:{
                      command:'back',
                      length:2
                    }
                  });
                  location.href = options.redirectHtmlUrl + '#' + btoa(json);
                }
                $(window).on('popstate',handler);
                history.go(-index);
              })();
              break;
            case 'none':
              manager.historyId = Date.now();
              headDfd.resolve('browserRestart');
              break;
            default :
              break;
          }
        } else {
          goHandler();
        }
      })();
      return dfd.promise();
    }

    // 外部からの遷移直後
    if (!history.state) {
      (function () {
        manager.historyId = Date.now();
        manager.replace('empty',null,0);
        headDfd.resolve('initial');
      })();
      return dfd.promise();
    }
    // なし
  };
  /**
   * @name replace
   * @memberOf BeautifulHistory
   * @function
   *
   * @param type
   * @param options
   * @param index
   */
  BeautifulHistory.replace = function replace(type,options,index) {
    var manager = this;
    if (manager.debug) {
      console.info('BeautifulHistory.replace(type,options)', type, options);
    }
    var index = typeof index === 'number' ? index : this.currentIndex;
    var info = this.controllers[index];
    // replace元とtypeが同じ場合のみ再利用する
    if (info && info.type === type) {
      info.options = options;
    } else {
      info = this.createInfo(type, options);
    }
    if (!info.isShown) {
      var controller = info.controller;
      var showCallback = manager.types[type].show;
      showCallback(controller,options);
      info.isShown = true;
      if (!this.controllers[index]) {
        this.controllers[index] = info;
      }
      manager.trigger('show',type,controller);
    }
    history.replaceState(manager.convertInfoToState(info,index));
  };
  /**
   * @name push
   * @memberOf BeautifulHistory
   * @function
   *
   * @param type
   * @param options
   */
  BeautifulHistory.push = function push(type,options) {
    var manager = this;
    if (manager.debug) {
      console.info('BeautifulHistory.push(type,options)', type, options);
    }
    // controllersのcurrentIndex以降をtruncateする
    this.controllers.length = this.currentIndex + 1;
    var index = this.currentIndex + 1;
    var info = this.createInfo(type, options, {isShown: true});
    this.controllers.push(info);
    history.pushState(this.convertInfoToState(info,index));
    BeautifulProperties.Hookable.Get.refreshProperty(BeautifulHistory,'currentIndex');
    BeautifulProperties.Hookable.Get.refreshProperty(BeautifulHistory,'maxIndex');
  };

  /**
   * @name go
   * @memberOf BeautifulHistory
   * @function
   *
   * @param {number} index 遷移先index
   * @param {boolean=} silently デフォルト値false
   * @returns {promise}
   */
  BeautifulHistory.go = function go(index,silently) {
    silently = silently !== undefined ? silently : false;
    var manager = this;
    var currentIndex = manager.currentIndex;
    var dfd = $.Deferred();
    if (currentIndex === index) {
      return dfd.resolve().promise();
    }
    if (silently) {
      manager.duringSilentOperation = true;
    }
    function handler(){
      $(window).off('popstate',handler);
      if (silently) {
        manager.duringSilentOperation = false;
      }
      dfd.resolve();
    }
    $(window).on('popstate',handler);
    history.go(index - currentIndex);
    return dfd.promise();
  };
  $(window).on('popstate',function(jqEv){
    var manager = this;
    var ev = jqEv.originalEvent;
    if (manager.debug) {
      console.log('popstate ev.state,history.state,manager.duringSilentOperation',ev.state,history.state,manager.duringSilentOperation);
    }
    if (manager.duringSilentOperation) {
      return;
    }
    BeautifulProperties.Hookable.Get.refreshProperty(BeautifulHistory,'currentIndex');
  });
  /**
   * @name collapse
   * @memberOf BeautifulHistory
   * @function
   *
   * @param {number} startIndex
   * @param {number} endIndex
   * @returns {promise}
   * @description historyの圧縮を行う。<br/>
   * startIndex〜endIndexの履歴をendIndex1個に置き換える。<br/>
   * endIndexが末尾の場合は一つ前に即座に戻るforceBackをpushしておく。<br/>
   */
  BeautifulHistory.collapse = function collapse(startIndex,endIndex) {
    var dfd = $.Deferred();
    var manager = this;
    if (manager.debug) {
      console.info('BeautifulHistory.collapse(startIndex, endIndex)', startIndex, endIndex);
    }
    var currentIndex = this.currentIndex;
    manager.duringSilentOperation = true;
    manager.controllers.splice(startIndex,(endIndex - startIndex));
    $(window).on('popstate',didBackToStartIndex);
    history.go(startIndex - currentIndex);

    function didBackToStartIndex(jqEv){
      $(window).off('popstate',didBackToStartIndex);
      (function (info) {
        history.replaceState(manager.convertInfoToState(info,startIndex));
      })(manager.controllers[startIndex]);
      if (manager.controllers.length === startIndex + 1) {
        // 後続はない
        manager.duringSilentOperation = false;
        $(window).on('popstate',didPopFromForceBack);
        manager.push('forceBack');
        return;
      }
      push();
    }
    function didPopFromForceBack(jqEv){
      $(window).off('popstate',didPopFromForceBack);
      BeautifulProperties.Hookable.Get.refreshProperty(BeautifulHistory,'maxIndex');
      setTimeout(function(){
        dfd.resolve();
      },16);
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
        dfd.resolve();
        return;
      }
      (function (info) {
        history.pushState(manager.convertInfoToState(info,nextIndex));
      })(manager.controllers[nextIndex]);
      push();
    }
    return dfd.promise();
  };
  /**
   * @name backToPreviousDocument
   * @memberOf BeautifulHistory
   * @function
   * @description 現documentに遷移してくる前のdocumentまで戻る
   */
  BeautifulHistory.backToPreviousDocument = function backToPreviousDocument(){
    $(window).off('popstate');
    $(window).on('popstate',function(){
      history.back();
    });
    history.back();
  };
  BeautifulHistory.createInfo = function createInfo(type, options, override){
    override = override || Object.create(null);
    var callbacks = this.types[type];
    var controller = (callbacks.factory)(options);
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
      console.log('change:currentIndex(increment) currentIndex, previousIndex',currentIndex, previousIndex);
    }
    if (currentIndex === -1 || previousIndex === undefined || currentIndex >= previousIndex) {
      return;
    }
    // 減った
    var range = _.range(currentIndex + 1, previousIndex + 1).reverse();
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
      var hideCallback = (BeautifulHistory.types[info.type].hide);
      var options = info.options;
      hideCallback(info.controller,options);
      info.isShown = false;
    });
  });
  BeautifulHistory.on('change:currentIndex',function(ev,currentIndex,previousIndex){
    var manager = this;
    if (manager.debug) {
      console.log('change:currentIndex(decrement) currentIndex, previousIndex',currentIndex, previousIndex);
    }
    previousIndex = previousIndex || 0;
    if (currentIndex < previousIndex) {
      return;
    }
    // 増えた
    var range = _.range(previousIndex + 1,currentIndex + 1);
    if (manager.debug) {
      console.log('change:currentIndex(decrement) range',range);
    }
    range.map(function(index){
      return BeautifulHistory.controllers[index];
    }).forEach(function(info,index){
      index = range[index];
      if (manager.debug) {
        console.log('change:currentIndex(decrement) info, index',info, index);
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