import {
  Scope,
  Send,
  SendOne,
  Receive,
  ReceiveOne,
  Respond,
  TIME,
  CONTEXT,
  CHANGES,
  State,
  Root,
  Data,
  dispose,
  extend,
  inherit,
  reset,
  exec,
  sendWillUpdate,
  IData,
  ICompute,
  Compute,
  COMPUTES,
  sendMayUpdate,
  IReactive,
  Reactive,
  connect,
} from "./core.js";

/**
 * @const
 * @enum {number}
 */
var Mutation = {
  None: 0,
  TypeMask: 1023,
  InsertOne: 1024,
  InsertRange: 2048,
  DeleteOne: 4096,
  DeleteRange: 8192,
  OrderSort: 16384,
  OrderReverse: 32768,
  Assign: 65536,
  Modify: 131072,
  ModifyRange: 262144
};

/**
 * @const
 * @enum {number}
 */
var Mutations = {
  Set: 1,
  Pop: 2,
  Push: 3,
  Reverse: 4,
  Shift: 5,
  Sort: 6,
  Splice: 7,
  Unshift: 8,
  Fill: 9,
  CopyWithin: 10,
  Modify: 11,
};

/**
 * @const
 */
var ArrayProto = Array.prototype;

/**
 * @package
 * @type {number}
 */
var MUT_SEED = Mutations.Modify;

/**
 * @public
 * @returns {number}
 */
function mutation() {
  return ++MUT_SEED;
}

/**
 * @enum {number}
 */
var ArgType = {
  Void: 0,
  NotReactive: 1,
  Reactive: 2,
  Callback: 3,
  Variadic: 4,
};

/**
 * 
 * @param {*} arg 
 * @returns {ArgType}
 */
function argType(arg) {
  switch (typeof arg) {
    case "function":
      return ArgType.Callback;
    case "object":
      if (arg !== null && arg instanceof Reactive) {
        return ArgType.Reactive;
      }
  }
  return ArgType.NotReactive;
}

/**
 * @template T
 * @param {T | Signal<T> | (function(): T)} val 
 * @param {ArgType} type 
 * @returns {T}
 */
function argValue(val, type) {
  switch (type) {
    case ArgType.Callback:
      return /** @type {function(): T} */(val)();
    case ArgType.Reactive:
      return /** @type {Reactive<T>} */(val).val();
  }
  return /** @type {T} */(val);
}

/**
 * @final
 * @struct
 * @template T, U
 * @constructor
 * @param {T | Signal<T> | (function(): T)=} arg1
 * @param {ArgType=} type1
 * @param {U | Signal<U> | (function(): U)=} arg2
 * @param {ArgType=} type2
 */
function Arguments(arg1, type1, arg2, type2) {
  /**
   * @package
   * @type {number}
   */
  this.index = -1;
  /**
   * @package
   * @type {T | undefined}
   */
  this._arg1 = arg1;
  /**
   * @package
   * @type {ArgType}
   */
  this._type1 = type1 || ArgType.NotReactive;
  /**
   * @package
   * @type {U | undefined}
   */
  this._arg2 = arg2;
  /**
   * @package
   * @type {ArgType}
   */
  this._type2 = type2 || ArgType.NotReactive;
}

/**
 * @package
 * @returns {T}
 */
Arguments.prototype.arg1 = function () {
  return argValue(this._arg1, this._type1);
};

/**
 * @package
 * @returns {U}
 */
Arguments.prototype.arg2 = function () {
  return argValue(this._arg2, this._type2);
};

/**
 * @struct
 * @template T
 * @constructor
 * @param {T} val
 * @extends {Root}
 */
function MapRoot(val) {
  /**
   * @package
   * @type {number}
   */
  this._state = State.Void;
  /**
   * @package
   * @type {Array<Receive> | null}
   */
  this._children = null;
  /**
   * @package
   * @type {Array<function(boolean): void> | null}
   */
  this._cleanups = null;
  /**
   * @package
   * @type {T}
   */
  this._value = val;
  /**
   * @package
   * @type {Data<number> | null}
   */
  this._index = null;
}

extend(MapRoot, Root);

/**
 * @package
 * @template T, U
 * @param {(function(T): U) | (function(T, ReadonlySignal<number>): U)} fn 
 * @param {number} index
 * @returns {U}
 */
MapRoot.prototype._map = function (fn, index) {
  var owner = CONTEXT._owner;
  var listen = CONTEXT._listen;
  CONTEXT._owner = this;
  CONTEXT._listen = null;
  try {
    if (fn.length > 1) {
      this._index = new Data(index);
      return fn(this._value, this._index);
    }
    return fn(this._value);
  } finally {
    CONTEXT._owner = owner;
    CONTEXT._listen = listen;
  }
};

/**
 * @interface
 * @template T
 * @extends {Send<T>}
 * @extends {IReactive<ReadonlyArray<T>>}
 * @extends {SignalIterator<T>}
 */
function IReactiveIterator() { }

/**
 * @struct
 * @abstract
 * @template T
 * @constructor
 * @extends {Reactive<ReadonlyArray<T>>}
 * @implements {IReactiveIterator<T>}
 */
function ReactiveIterator() { }

extend(ReactiveIterator, Reactive);

/**
 * @public
 * @returns {number}
 */
ReactiveIterator.prototype.length = function () {
  return this.val().length;
};

/**
 * @template T
 * @param {ReactiveIterator<T>} source
 * @param {T | undefined} prev
 * @param {Arguments<number, undefined>} args
 * @returns {T | undefined}
 */
function atIterator(source, prev, args) {
  var array = source.peek();
  var index = args.arg1();
  return array.at(index);
}

/**
 * @param {number | ReadonlySignal<number> | (function(): number)} index
 * @returns {ReadonlySignal<T | undefined>}
 */
ReactiveIterator.prototype.at = function (index) {
  return new ComputeReduce(
    this,
    atIterator,
    /** @type {number} */(index),
    argType(index)
  );
};

/**
 * @template T
 * @param {ReactiveIterator<T>} source
 * @param {Array<T>} prev
 * @param {Arguments<T | Array<T>, undefined>} args
 * @returns {Array<T>}
 */
function copyIterator(source, prev, args) {
  var array = source.peek();
  return array.slice();
}

/**
 * @template T
 * @param {ReactiveIterator<T>} source
 * @param {Array<T>} prev
 * @param {Arguments<T | Array<T>, undefined>} args
 * @returns {Array<T>}
 */
function concatIterator(source, prev, args) {
  var array = source.peek();
  if (args._type1 === ArgType.Variadic) {
    /**
     * @type {Array<T | Array<T> | Signal<T> | Array<Signal<T>>>}
     */
    var params = args.arg1();
    /**
     * @const
     * @type {number}
     */
    var len = params.length;
    /**
     * @type {Array<T | Array<T>>}
     */
    var slice = new Array(len);
    for (var i = 0; i < len; i++) {
      var param = params[i];
      slice[i] = argValue(param, argType(param));
    }
    return ArrayProto.concat.apply(array, slice);
  }
  return array.concat(args.arg1());
}

/**
 * @public
 * @param {...(T | Array<T> | ReadonlySignal<T> | ReadonlySignal<Array<T>>)} items
 * @returns {SignalIterator<T>}
 */
ReactiveIterator.prototype.concat = function (items) {
  var len = arguments.length;
  if (len === 0) {
    return new ComputeArray(this, copyIterator);
  }
  if (len === 1) {
    return new ComputeArray(this, concatIterator, items, argType(items));
  }
  /**
   * @type {Array<T | Array<T> | ReadonlySignal<T> | ReadonlySignal<Signal<T>>>}
   */
  var args = new Array(len);
  for (var i = 0; i < len; i++) {
    args[i] = arguments[i];
  }
  return new ComputeArray(
    this,
    concatIterator,
    args,
    ArgType.Variadic
  );
};

/**
 * @template T
 * @param {ReactiveIterator<T>} source 
 * @param {boolean} prev 
 * @param {Arguments<function(T, number): boolean, undefined>} args 
 * @returns {boolean}
 */
function everyIterator(source, prev, args) {
  var array = source.peek();
  var callbackFn = args.arg1();
  return array.every(callbackFn);
}

/**
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<boolean>}
 */
ReactiveIterator.prototype.every = function (callbackFn) {
  return new ComputeReduce(
    this,
    everyIterator,
    callbackFn
  );
};

/**
 * @template T
 * @param {ReactiveIterator<T>} source
 * @param {Array<T>} prev
 * @param {Arguments<(function(T, number): boolean), undefined>} args
 * @returns {Array<T>}
 */
function filterIterator(source, prev, args) {
  var array = source.peek();
  var callbackFn = args.arg1();
  return array.filter(callbackFn);
}

/**
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @returns {SignalIterator<T>}
 */
ReactiveIterator.prototype.filter = function (callbackFn) {
  return new ComputeArray(
    this,
    filterIterator,
    callbackFn
  );
};

/**
 * @template T
 * @param {ReactiveIterator<T>} source
 * @param {T | undefined} prev
 * @param {Arguments<(function(T, number): boolean), undefined>} args
 * @returns {T | undefined}
 */
function findIterator(source, prev, args) {
  var array = source.peek();
  var callbackFn = args.arg1();
  return array.find(callbackFn);
}

/**
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<T | undefined>}
 */
ReactiveIterator.prototype.find = function (callbackFn) {
  return new ComputeReduce(
    this,
    findIterator,
    callbackFn
  )
};

/**
 * @template T
 * @param {ReactiveIterator<T>} source
 * @param {number} prev
 * @param {Arguments<function(T, number): boolean, undefined>} args
 * @returns {number}
 */
function findIndexIterator(source, prev, args) {
  var array = source.peek();
  var callbackFn = args.arg1();
  return array.findIndex(callbackFn);
}

/**
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<number>}
 */
ReactiveIterator.prototype.findIndex = function (callbackFn) {
  return new ComputeReduce(
    this,
    findIndexIterator,
    callbackFn
  );
};

/**
 * @template T
 * @param {ReactiveIterator<T>} source
 * @param {T | undefined} prev
 * @param {Arguments<(function(T, number): boolean), undefined>} args
 * @returns {T | undefined}
 */
function findLastIterator(source, prev, args) {
  var array = source.peek();
  var callbackFn = args.arg1();
  return array.findLast(callbackFn);
}

/**
 * @public
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<T | undefined>}
 */
ReactiveIterator.prototype.findLast = function (callbackFn) {
  return new ComputeReduce(
    this,
    findLastIterator,
    callbackFn
  );
};

/**
 * @template T
 * @param {ReactiveIterator<T>} source
 * @param {number} prev
 * @param {Arguments<(function(T, number): boolean), undefined>} args
 * @returns {number}
 */
function findLastIndexIterator(source, prev, args) {
  var array = source.peek();
  var callbackFn = args.arg1();
  return array.findLastIndex(callbackFn);
}

/**
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<number>}
 */
ReactiveIterator.prototype.findLastIndex = function (callbackFn) {
  return new ComputeReduce(
    this,
    findLastIndexIterator,
    callbackFn
  )
};

/**
 * @template T
 * @param {ReactiveIterator<T>} source
 * @param {void} prev
 * @param {Arguments<(function(T, number): void), undefined>} args
 * @returns {void}
 */
function forEachIterator(source, prev, args) {
  var array = source.peek();
  var callbackFn = args.arg1();
  array.forEach(callbackFn);
}

/**
 * @param {function(T, number): void} callbackFn
 * @returns {ReadonlySignal<void>}
 */
ReactiveIterator.prototype.forEach = function (callbackFn) {
  return new ComputeReduce(
    this,
    forEachIterator,
    callbackFn
  );
};

/**
 * @template T
 * @param {ReactiveIterator<T>} source
 * @param {boolean} prev
 * @param {Arguments<T, undefined>} args
 * @returns {boolean}
 */
function includesIterator(source, prev, args) {
  var array = source.peek();
  var searchElement = args.arg1();
  return array.includes(searchElement);
}

/**
 * @param {T | ReadonlySignal<T> | (function(): T)} searchElement
 * @returns {ReadonlySignal<boolean>}
 */
ReactiveIterator.prototype.includes = function (searchElement) {
  return new ComputeReduce(
    this,
    includesIterator,
    searchElement,
    argType(searchElement)
  );
};

/**
 * @template T
 * @param {ReactiveIterator<T>} source
 * @param {number} prev
 * @param {Arguments<T, number | undefined>} args
 * @returns {number}
 */
function indexOfIterator(source, prev, args) {
  var array = source.peek();
  var searchElement = args.arg1();
  var fromIndex = args.arg2();
  return array.indexOf(searchElement, fromIndex);
}

/**
 * @param {T | ReadonlySignal<T> | (function(): T)} searchElement
 * @param {number | ReadonlySignal<number> | (function(): number)=} fromIndex
 * @returns {ReadonlySignal<number>}
 */
ReactiveIterator.prototype.indexOf = function (searchElement, fromIndex) {
  return new ComputeReduce(
    this,
    indexOfIterator,
    /** @type {T} */(searchElement),
    argType(searchElement),
    /** @type {number} */(fromIndex),
    argType(searchElement)
  );
};

/**
 * @template T
 * @param {ReactiveIterator<T>} source
 * @param {string} prev
 * @param {Arguments<T, string | undefined>} args
 * @returns {string}
 */
function joinIterator(source, prev, args) {
  var array = source.peek();
  var separator = /** @type {string | undefined} */(args.arg1());
  return array.join(separator);
}

/**
 * @param {string | ReadonlySignal<string> | (function(): string)=} separator
 * @returns {ReadonlySignal<string>}
 */
ReactiveIterator.prototype.join = function (separator) {
  return new ComputeReduce(this, joinIterator, separator, argType(separator));
};

/**
 * @template T
 * @param {ReactiveIterator<T>} source
 * @param {number} prev
 * @param {Arguments<T, number | undefined>} args
 * @returns {number}
 */
function lastIndexOfIterator(source, prev, args) {
  var array = source.peek();
  var searchElement = args.arg1();
  var fromIndex = args.arg2();
  return array.lastIndexOf(searchElement, fromIndex);
}

/**
 * @param {T | ReadonlySignal<T> | (function(): T)} searchElement
 * @param {number | ReadonlySignal<number> | (function(): number)=} fromIndex
 * @returns {ReadonlySignal<number>}
 */
ReactiveIterator.prototype.lastIndexOf = function (searchElement, fromIndex) {
  return new ComputeReduce(
    this,
    lastIndexOfIterator,
    searchElement,
    argType(searchElement),
    /** @type {number} */(fromIndex),
    argType(fromIndex)
  );
};

/**
 * @template T, U
 * @param {Array<MapRoot<T>>} roots
 * @param {ReactiveIterator<T>} source
 * @param {Array<U>} mapped
 * @param {Arguments<(function(T, ReadonlySignal<number>): U), (function(T): primitive) | undefined>} args
 * @returns {Array<U>}
 */
function mapIterator(roots, source, mapped, args) {
  var array = source.peek();
  var callbackFn = args.arg1();
  return array.map(callbackFn);
}

/**
 * @template U
 * @param {function(T, ReadonlySignal<number>): U} callbackFn
 * @param {function(T): primitive=} keyFn
 * @returns {SignalIterator<U>}
 */
ReactiveIterator.prototype.map = function (callbackFn, keyFn) {
  return new ComputeMapArray(
    this,
    mapIterator,
    callbackFn,
    ArgType.NotReactive,
    keyFn,
    argType(keyFn)
  );
};

/**
 * @template T, U, V
 * @param {ReactiveIterator<T>} source
 * @param {V} prev
 * @param {Arguments<(function((T | U), T, number): V), U | undefined>} args
 * @returns {V}
 */
function reduceIterator(source, prev, args) {
  var array = source.peek();
  var callbackFn = args.arg1();
  if (args._type2 === ArgType.Void) {
    return array.reduce(callbackFn);
  }
  var initialValue = args.arg2();
  return array.reduce(callbackFn, initialValue);
}

/**
 * @template U, V
 * @param {function((T | U), T, number): V} callbackFn
 * @param {U | ReadonlySignal<U> | (function(): U)=} initialValue
 * @returns {ReadonlySignal<V>}
 */
ReactiveIterator.prototype.reduce = function (callbackFn, initialValue) {
  var type = arguments.length < 2 ? ArgType.Void : argType(initialValue);
  return new ComputeReduce(
    this,
    reduceIterator,
    callbackFn,
    ArgType.NotReactive,
    initialValue,
    type
  );
};

/**
 * @template T, U
 * @param {ReactiveIterator<T>} source
 * @param {U} prev
 * @param {Arguments<(function((T | U), T, number): U), U | undefined>} args
 * @returns {U}
 */
function reduceRightIterator(source, prev, args) {
  var array = source.peek();
  var callbackFn = args.arg1();
  if (args._type2 === ArgType.Void) {
    return array.reduceRight(callbackFn);
  }
  var initialValue = args.arg2();
  return array.reduceRight(callbackFn, initialValue);
}

/**
 * @template U
 * @param {function((T | U), T, number): U} callbackFn
 * @param {U | ReadonlySignal<U> | (function(): U)=} initialValue
 * @returns {ReadonlySignal<U>}
 */
ReactiveIterator.prototype.reduceRight = function (callbackFn, initialValue) {
  var type = arguments.length < 2 ? ArgType.Void : argType(initialValue);
  return new ComputeReduce(
    this,
    reduceRightIterator,
    callbackFn,
    ArgType.NotReactive,
    initialValue,
    type
  );
};

/**
 * @template T
 * @param {ReactiveIterator<T>} source
 * @param {Array<T>} prev
 * @param {Arguments<number, number>} args
 * @returns {Array<T>}
 */
function sliceIterator(source, prev, args) {
  var array = source.peek();
  var start = args.arg1();
  var end = args.arg2();
  return array.slice(start, end);
}

/**
 * @param {number | ReadonlySignal<number> | (function(): number)=} start
 * @param {number | ReadonlySignal<number> | (function(): number)=} end
 * @returns {SignalIterator<T>}
 */
ReactiveIterator.prototype.slice = function (start, end) {
  return new ComputeArray(
    this,
    sliceIterator,
    /** @type {number} */(start),
    argType(start),
    /** @type {number} */(end),
    argType(end)
  );
};

/**
 * @template T
 * @param {ReactiveIterator<T>} source
 * @param {boolean} prev
 * @param {Arguments<function(T, number): boolean, void>} args
 * @returns {boolean}
 */
function someIterator(source, prev, args) {
  var array = source.peek();
  var callbackFn = args.arg1();
  return array.some(callbackFn);
}

/**
 * @param {function(T, number): boolean} callbackFn
 * @returns {ReadonlySignal<boolean>}
 */
ReactiveIterator.prototype.some = function (callbackFn) {
  return new ComputeReduce(this, someIterator, callbackFn);
};

/**
 * @interface
 * @template T
 * @extends {Receive<T>}
 * @extends {ICompute<T>}
 */
function IComputeReduce() { }

/**
 * @struct
 * @template T, U, V, W
 * @constructor
 * @param {ReactiveIterator<T>} source
 * @param {function(ReactiveIterator<T>, U, Arguments<V, W>): U} fn
 * @param {V | Signal<V> | (function(): V)=} arg1
 * @param {ArgType=} type1
 * @param {W | Signal<W> | (function(): W)=} arg2
 * @param {ArgType=} type2
 * @extends {Compute<U>}
 * @implements {IComputeReduce<U>}
 */
function ComputeReduce(source, fn, arg1, type1, arg2, type2) {
  Compute.call(this, fn);
  /**
   * @package
   * @type {Arguments<V, W>}
   */
  this._args = new Arguments(arg1, type1, arg2, type2);
  connect(source, this);
}

extend(ComputeReduce, Compute);

/**
 * @package
 * @override
 * @returns {void}
 */
ComputeReduce.prototype._apply = function () {
  var source = /** @type {ReactiveIterator<T>} */ (this._source1);
  this._value = this._next(source, this._value, this._args);
};

/**
 * @interface
 * @template T
 * @extends {IReactiveIterator<T>}
 */
function IComputeArrayStub() { }

/**
 * This only exists because Closure Compiler
 * cannot handle multiple prototype inheritance
 * @struct
 * @abstract
 * @template T
 * @constructor
 * @extends {ReactiveIterator<T>}
 * @implements {IComputeArrayStub<T>}
 */
function ComputeArrayStub() { }

/**
 * @package
 * @type {number}
 */
ComputeArray.prototype._time;

/**
 * @package
 * @type {number}
 */
ComputeArray.prototype._utime;

/**
 * @package
 * @type {number}
 */
ComputeArrayStub.prototype._dtime;

/**
 * @package
 * @type {Receive | null}
 */
ComputeArrayStub.prototype._node1;

/**
 * @package
 * @type {number}
 */
ComputeArrayStub.prototype._node1slot;

/**
 * @package
 * @type {Array<Receive> | null}
 */
ComputeArrayStub.prototype._nodes;

/**
 * @package
 * @type {Array<number> | null}
 */
ComputeArrayStub.prototype._nodeslots;

/**
 * @package
 * @type {Send | null}
 */
ComputeArrayStub.prototype._source1;

/**
 * @package
 * @type {number}
 */
ComputeArrayStub.prototype._source1slot;

/**
 * @package
 * @type {Receive | null}
 */
ComputeArrayStub.prototype._owner;

/**
 * @package
 * @type {(function(...?): T) | null}
 */
ComputeArrayStub.prototype._next;

/**
 * @package
 * @returns {void}
 */
ComputeArrayStub.prototype._dispose = function () { };

/**
 * @package
 * @returns {void}
 */
ComputeArrayStub.prototype._apply = function () { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
ComputeArrayStub.prototype._update = function (time) { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
ComputeArrayStub.prototype._receiveMayDispose = function (time) { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
ComputeArrayStub.prototype._receiveWillDispose = function (time) { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
ComputeArrayStub.prototype._receiveMayUpdate = function (time) { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
ComputeArrayStub.prototype._receiveWillUpdate = function (time) { };

/**
 * @interface
 * @template T
 * @extends {ICompute<ReadonlyArray<T>>}
 * @extends {IComputeArrayStub<T>}
 */
function IComputeArray() { }

/**
 * @struct
 * @template T, U, V, W
 * @constructor
 * @param {ReactiveIterator<T>} source
 * @param {function(ReactiveIterator<T>, Array<U>, Arguments<V, W>): Array<U>} fn
 * @param {V | Signal<V> | (function(): V)=} arg1
 * @param {ArgType=} type1
 * @param {W | Signal<W> | (function(): W)=} arg2
 * @param {ArgType=} type2
 * @extends {ComputeArrayStub<U>}
 * @implements {IComputeArray<U>}
 */
function ComputeArray(source, fn, arg1, type1, arg2, type2) {
  Compute.call(/** @type {?} */(this), fn);
  this._value = [];
  /**
   * @package
   * @type {Arguments<V, W>}
   */
  this._args = new Arguments(arg1, type1, arg2, type2);
  connect(source, this);
}

extend(ComputeArray, ReactiveIterator);
inherit(ComputeArray, Compute);

/**
 * @package
 * @override
 * @returns {void}
 */
ComputeArray.prototype._apply = function () {
  var source = /** @type {ReactiveIterator<T>} */ (this._source1);
  this._value = this._next(source, this._value, this._args);
};

/**
 * @struct
 * @template T, U, V, W
 * @constructor
 * @param {ReactiveIterator<T>} source
 * @param {function(Array<MapRoot<T>>, ReactiveIterator<T>, Array<U>, Arguments<V, W>): Array<U>} fn
 * @param {V | Signal<V> | (function(): V)=} arg1
 * @param {ArgType=} type1
 * @param {W | Signal<W> | (function(): W)=} arg2
 * @param {ArgType=} type2
 * @extends {ComputeArray<U>}
 * @implements {IComputeArray<U>}
 */
function ComputeMapArray(source, fn, arg1, type1, arg2, type2) {
  Compute.call(/** @type {?} */(this), fn);
  this._value = [];
  /**
   * @package
   * @type {Arguments<V, W>}
  */
  this._args = new Arguments(arg1, type1, arg2, type2);
  /**
   * @package
   * @type {Array<MapRoot<T>>}
   */
  this._mapped = [];
  connect(source, this);
}

extend(ComputeMapArray, ComputeArray);

/**
 * @interface
 * @template T
 * @extends {IData<ReadonlyArray<T>>}
 * @extends {IReactiveIterator<T>}
 */
function IDataArrayStub() { }

/**
 * @struct
 * @abstract
 * @constructor
 * @template T
 * @extends {ReactiveIterator<T>}
 * @implements {IDataArrayStub<T>}
 */
function DataArrayStub() { }

/**
 * @package
 * @type {T | Object}
 */
DataArrayStub.prototype._next;

/**
 * @package
 * @type {Receive | null}
 */
DataArrayStub.prototype._node1;

/**
 * @package
 * @type {number}
 */
DataArrayStub.prototype._node1slot;

/**
 * @package
 * @type {Array<Receive> | null}
 */
DataArrayStub.prototype._nodes;

/**
 * @package
 * @type {Array<number> | null}
 */
DataArrayStub.prototype._nodeslots;

/**
 * @package
 * @returns {void}
 */
DataArrayStub.prototype._dispose = function () { };

/**
 * @package
 * @param {number} time
 * @returns {void}
 */
DataArrayStub.prototype._update = function (time) { };

/**
 * @interface
 * @template T
 * @extends {SignalArray<T>}
 * @extends {IDataArrayStub<T>}
 */
function IDataArray() { }

/**
 * @final
 * @struct
 * @template T
 * @constructor
 */
function Change() {
  /**
   * @package
   * @type {number}
   */
  this._mut = Mutation.None;
  /**
   * @package 
   * @type {number}
   */
  this._index = -1;
  /**
   * @package
   * @type {number}
   */
  this._inserts = -1;
  /**
   * @package
   * @type {number}
   */
  this._deletes = -1;
  /**
   * @package
   * @type {T | Array<T> | (function(T, T): number) | (function(Array<T>): Array<T>) | Array<(function(Array<T>): Array<T>)> | null | undefined}
   */
  this._data = null;
}

/**
 * @package
 * @param {number} mut 
 * @param {number=} index 
 * @param {number=} deletes
 * @param {number=} inserts
 * @param {T | Array<T> | (function(T, T): number) | (function(Array<T>): Array<T>)=} data
 * @returns {void}
 */
Change.prototype.add = function (mut, index, deletes, inserts, data) {
  if (this._mut === Mutation.None) {
    this._mut = mut;
    this._data = data;
    this._index = index || -1;
    this._deletes = deletes || -1;
    this._inserts = inserts || -1;
  } else if ((this._mut & Mutation.Modify) && (mut & Mutation.Modify)) {
    this._mut |= Mutation.ModifyRange;
    if (argType(this._data) === ArgType.Callback) {
      this._data = /** @type {Array<(function(Array<T>): Array<T>)>} */([this._data, data]);
    } else {
      /** @type {Array<(function(Array<T>): Array<T>)>} */(this._data).push(data);
    }
  } else {
    throw new Error("Conflicting mutation");
  }
};

/**
 * @package
 * @returns {void}
 */
Change.prototype.reset = function () {
  this._mut = Mutation.None;
  this._index =
    this._inserts =
    this._deletes = -1;
  this._data = null;
};

/**
 * @struct
 * @template T
 * @constructor
 * @param {Array<T>=} val
 * @extends {DataArrayStub<T>}
 * @implements {IDataArray<T>}
 */
function DataArray(val) {
  Data.call(/** @type {?} */(this), val || []);
  this._next = new Change();
  /**
   * @package
   * @type {Change}
   */
  this._change = new Change();
}

extend(DataArray, ReactiveIterator);
inherit(DataArray, Data);

/**
 * @package
 * @param {number} mut
 * @param {number=} index
 * @param {number=} deletes
 * @param {number=} inserts
 * @param {T | Array<T> | (function(T, T): boolean)=} data
 * @returns {void}
 */
DataArray.prototype._mutate = function (mut, index, deletes, inserts, data) {
  if (!(this._state & (State.QueueDispose | State.Disposed))) {
    this._next.add(mut, index, deletes, inserts, data);
    if (CONTEXT._idle) {
      this._apply();
      if (this._state & State.Send) {
        reset();
        sendWillUpdate(this, TIME + 1);
        exec();
      }
    } else {
      this._state |= State.WillUpdate;
      CHANGES._add(this);
    }
  }
};

/**
 * @package
 * @returns {void}
 */
DataArray.prototype._apply = function () {
  var next = this._next;
  var mut = next._mut;
  var value = /** @type {Array<T>} */(this._value);
  switch (mut & Mutation.TypeMask) {
    case Mutations.Set:
      this._value = /** @type {ReadonlyArray<T>} */(next._data);
      break;
    case Mutations.Pop:
      value.pop();
      break;
    case Mutations.Push:
      if (mut & Mutation.InsertRange) {
        ArrayProto.push.apply(value, /** @type {Array<T>} */(next._data));
      } else {
        value.push(/** @type {T} */(next._data));
      }
      break;
    case Mutations.Reverse:
      value.reverse();
      break;
    case Mutations.Shift:
      value.shift();
      break;
    case Mutations.Sort:
      value.sort(/** @type {function(T, T): number} */(next._data));
      break;
    case Mutations.Splice:
      if (mut & Mutation.InsertRange) {
        ArrayProto.splice.apply(value, /** @type {Array<number | T>} */(next._data));
      } else if (mut & Mutation.InsertOne) {
        value.splice(next._index, next._deletes, /** @type {T} */(next._data))
      } else {
        value.splice(next._index, next._deletes);
      }
      break;
    case Mutations.Unshift:
      if (mut & Mutation.InsertRange) {
        ArrayProto.unshift.apply(value, /** @type {Array<T>} */(next._data));
      } else {
        value.unshift(/** @type {T} */(next._data));
      }
      break;
    case Mutations.Fill:
      // todo
      break;
    case Mutations.CopyWithin:
      // todo
      break;
    case Mutations.Modify:
      if (mut & Mutation.ModifyRange) {
        /** @type {Array<(function(Array<T>): Array<T>)>} */(next._data).forEach(function (callbackFn) {
        value = callbackFn(value);
      });
      } else {
        value = /** @type {function(Array<T>): Array<T>} */(next._data)(value);
      }
      this._value = value;
      break;
  }
  this._change._mut = next._mut;
  this._change._index = next._index;
  this._change._deletes = next._deletes;
  this._change._inserts = next._inserts;
  next.reset();
};

/**
 * @public
 * @param {ReadonlyArray<T>} val
 * @returns {void}
 */
DataArray.prototype.set = function (val) {
  this._mutate(Mutations.Set | Mutation.Assign, -1, -1, -1, val);
};

/**
 * @public
 * @param {function(Array<T>): Array<T>} callbackFn
 * @returns {void}
 */
DataArray.prototype.modify = function (callbackFn) {
  this._mutate(Mutations.Modify | Mutation.Modify, -1, -1, -1, callbackFn);
};

/**
 * @public
 * @returns {void}
 */
DataArray.prototype.pop = function () {
  this._mutate(Mutations.Pop | Mutation.DeleteOne, this._value.length - 1, 1, 0);
};

/**
 * @public
 * @param {...T} elementN
 * @returns {void}
 */
DataArray.prototype.push = function (elementN) {
  /**
   * @type {number}
   */
  var mut;
  /** @type {T | Array<T>} */
  var args;
  /** @type {number} */
  var len = arguments.length;
  if (len > 0) {
    if (len === 1) {
      args = elementN;
      mut = Mutation.InsertOne;
    } else {
      args = new Array(len);
      for (var i = 0; i < len; i++) {
        args[i] = arguments[i];
      }
      mut = Mutation.InsertRange;
    }
    this._mutate(Mutations.Push | mut, this._value.length, 0, len, args);
  }
};

/**
 * @public
 * @returns {void}
 */
DataArray.prototype.reverse = function () {
  this._mutate(Mutations.Reverse | Mutation.OrderReverse);
};

/**
 * @public
 * @returns {void}
 */
DataArray.prototype.shift = function () {
  this._mutate(Mutations.Shift | Mutation.DeleteOne, 0, 1, 0);
};

/**
 * @public
 * @param {function(T,T): number=} compareFn
 * @returns {void}
 */
DataArray.prototype.sort = function (compareFn) {
  this._mutate(Mutations.Sort | Mutation.OrderSort, void 0, 0, 0, compareFn);
};

/**
 * @public
 * @param {number} start
 * @param {number=} deleteCount
 * @param {...T} items
 * @returns {void}
 */
DataArray.prototype.splice = function (start, deleteCount, items) {
  /**
   * @type {T | Array<number | T>} 
   */
  var args;
  /**
   * @const
   * @type {number}
   */
  var len = arguments.length;
  if (len > 1) {
    /**
     * @type {number}
     */
    var mut = Mutation.None;
    if (deleteCount == null || deleteCount < 0) {
      deleteCount = 0;
    } else if (deleteCount > 0) {
      if (deleteCount > 1) {
        mut |= Mutation.DeleteRange;
      } else {
        mut |= Mutation.DeleteOne;
      }
    }
    if (len > 2) {
      if (len === 3) {
        args = items;
        mut |= Mutation.InsertOne;
      } else {
        args = new Array(len);
        for (var i = 0; i < len; i++) {
          args[i] = arguments[i];
        }
        mut |= Mutation.InsertRange;
      }
    }
    if (mut !== Mutation.None) {
      this._mutate(Mutations.Splice | mut, start, deleteCount, len - 2, args);
    }
  }
};

/**
 * @public
 * @param {...T} elementN
 * @returns {void}
 */
DataArray.prototype.unshift = function (elementN) {
  /** @type {T | Array<T>} */
  var args;
  /** @type {number} */
  var len = arguments.length;
  if (len > 0) {
    /** 
     * @type {number}
     */
    var mut;
    if (len === 1) {
      args = elementN;
      mut = Mutation.InsertOne;
    } else {
      args = new Array(len);
      for (var i = 0; i < len; i++) {
        args[i] = arguments[i];
      }
      mut = Mutation.InsertRange;
    }
    this._mutate(Mutations.Unshift | mut, 0, 0, len, args);
  }
};

/**
 * @template T
 * @param {Array<T>=} val
 * @returns {SignalArray<T>}
 */
function array(val) {
  return new DataArray(val);
}

window["anod"]["array"] = array;
window["anod"]["DataArray"] = DataArray;
window["anod"]["ComputeReduce"] = ComputeReduce;
window["anod"]["ComputeArray"] = ComputeArray;

export {
  array,
  DataArray,
  ComputeReduce,
  ComputeArray
}