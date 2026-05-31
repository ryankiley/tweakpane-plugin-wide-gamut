function forceCast(v) {
    return v;
}
function isEmpty(value) {
    return value === null || value === undefined;
}
function isObject$1(value) {
    return value !== null && typeof value === 'object';
}
function isRecord(value) {
    return value !== null && typeof value === 'object';
}
function deepEqualsArray(a1, a2) {
    if (a1.length !== a2.length) {
        return false;
    }
    for (let i = 0; i < a1.length; i++) {
        if (a1[i] !== a2[i]) {
            return false;
        }
    }
    return true;
}
function deepMerge(r1, r2) {
    const keys = Array.from(new Set([...Object.keys(r1), ...Object.keys(r2)]));
    return keys.reduce((result, key) => {
        const v1 = r1[key];
        const v2 = r2[key];
        return isRecord(v1) && isRecord(v2)
            ? Object.assign(Object.assign({}, result), { [key]: deepMerge(v1, v2) }) : Object.assign(Object.assign({}, result), { [key]: key in r2 ? v2 : v1 });
    }, {});
}

function isBinding(value) {
    if (!isObject$1(value)) {
        return false;
    }
    return 'target' in value;
}

const CREATE_MESSAGE_MAP = {
    alreadydisposed: () => 'View has been already disposed',
    invalidparams: (context) => `Invalid parameters for '${context.name}'`,
    nomatchingcontroller: (context) => `No matching controller for '${context.key}'`,
    nomatchingview: (context) => `No matching view for '${JSON.stringify(context.params)}'`,
    notbindable: () => `Value is not bindable`,
    notcompatible: (context) => `Not compatible with  plugin '${context.id}'`,
    propertynotfound: (context) => `Property '${context.name}' not found`,
    shouldneverhappen: () => 'This error should never happen',
};
class TpError {
    static alreadyDisposed() {
        return new TpError({ type: 'alreadydisposed' });
    }
    static notBindable() {
        return new TpError({
            type: 'notbindable',
        });
    }
    static notCompatible(bundleId, id) {
        return new TpError({
            type: 'notcompatible',
            context: {
                id: `${bundleId}.${id}`,
            },
        });
    }
    static propertyNotFound(name) {
        return new TpError({
            type: 'propertynotfound',
            context: {
                name: name,
            },
        });
    }
    static shouldNeverHappen() {
        return new TpError({ type: 'shouldneverhappen' });
    }
    constructor(config) {
        var _a;
        this.message =
            (_a = CREATE_MESSAGE_MAP[config.type](forceCast(config.context))) !== null && _a !== void 0 ? _a : 'Unexpected error';
        this.name = this.constructor.name;
        this.stack = new Error(this.message).stack;
        this.type = config.type;
    }
    toString() {
        return this.message;
    }
}

class BindingTarget {
    constructor(obj, key) {
        this.obj_ = obj;
        this.key = key;
    }
    static isBindable(obj) {
        if (obj === null) {
            return false;
        }
        if (typeof obj !== 'object' && typeof obj !== 'function') {
            return false;
        }
        return true;
    }
    read() {
        return this.obj_[this.key];
    }
    write(value) {
        this.obj_[this.key] = value;
    }
    writeProperty(name, value) {
        const valueObj = this.read();
        if (!BindingTarget.isBindable(valueObj)) {
            throw TpError.notBindable();
        }
        if (!(name in valueObj)) {
            throw TpError.propertyNotFound(name);
        }
        valueObj[name] = value;
    }
}

class Emitter {
    constructor() {
        this.observers_ = {};
    }
    on(eventName, handler, opt_options) {
        var _a;
        let observers = this.observers_[eventName];
        if (!observers) {
            observers = this.observers_[eventName] = [];
        }
        observers.push({
            handler: handler,
            key: (_a = opt_options === null || opt_options === void 0 ? void 0 : opt_options.key) !== null && _a !== void 0 ? _a : handler,
        });
        return this;
    }
    off(eventName, key) {
        const observers = this.observers_[eventName];
        if (observers) {
            this.observers_[eventName] = observers.filter((observer) => {
                return observer.key !== key;
            });
        }
        return this;
    }
    emit(eventName, event) {
        const observers = this.observers_[eventName];
        if (!observers) {
            return;
        }
        observers.forEach((observer) => {
            observer.handler(event);
        });
    }
}

class ComplexValue {
    constructor(initialValue, config) {
        var _a;
        this.constraint_ = config === null || config === void 0 ? void 0 : config.constraint;
        this.equals_ = (_a = config === null || config === void 0 ? void 0 : config.equals) !== null && _a !== void 0 ? _a : ((v1, v2) => v1 === v2);
        this.emitter = new Emitter();
        this.rawValue_ = initialValue;
    }
    get constraint() {
        return this.constraint_;
    }
    get rawValue() {
        return this.rawValue_;
    }
    set rawValue(rawValue) {
        this.setRawValue(rawValue, {
            forceEmit: false,
            last: true,
        });
    }
    setRawValue(rawValue, options) {
        const opts = options !== null && options !== void 0 ? options : {
            forceEmit: false,
            last: true,
        };
        const constrainedValue = this.constraint_
            ? this.constraint_.constrain(rawValue)
            : rawValue;
        const prevValue = this.rawValue_;
        const changed = !this.equals_(prevValue, constrainedValue);
        if (!changed && !opts.forceEmit) {
            return;
        }
        this.emitter.emit('beforechange', {
            sender: this,
        });
        this.rawValue_ = constrainedValue;
        this.emitter.emit('change', {
            options: opts,
            previousRawValue: prevValue,
            rawValue: constrainedValue,
            sender: this,
        });
    }
}

class PrimitiveValue {
    constructor(initialValue) {
        this.emitter = new Emitter();
        this.value_ = initialValue;
    }
    get rawValue() {
        return this.value_;
    }
    set rawValue(value) {
        this.setRawValue(value, {
            forceEmit: false,
            last: true,
        });
    }
    setRawValue(value, options) {
        const opts = options !== null && options !== void 0 ? options : {
            forceEmit: false,
            last: true,
        };
        const prevValue = this.value_;
        if (prevValue === value && !opts.forceEmit) {
            return;
        }
        this.emitter.emit('beforechange', {
            sender: this,
        });
        this.value_ = value;
        this.emitter.emit('change', {
            options: opts,
            previousRawValue: prevValue,
            rawValue: this.value_,
            sender: this,
        });
    }
}

class ReadonlyPrimitiveValue {
    constructor(value) {
        this.emitter = new Emitter();
        this.onValueBeforeChange_ = this.onValueBeforeChange_.bind(this);
        this.onValueChange_ = this.onValueChange_.bind(this);
        this.value_ = value;
        this.value_.emitter.on('beforechange', this.onValueBeforeChange_);
        this.value_.emitter.on('change', this.onValueChange_);
    }
    get rawValue() {
        return this.value_.rawValue;
    }
    onValueBeforeChange_(ev) {
        this.emitter.emit('beforechange', Object.assign(Object.assign({}, ev), { sender: this }));
    }
    onValueChange_(ev) {
        this.emitter.emit('change', Object.assign(Object.assign({}, ev), { sender: this }));
    }
}

function createValue(initialValue, config) {
    const constraint = config === null || config === void 0 ? void 0 : config.constraint;
    const equals = config === null || config === void 0 ? void 0 : config.equals;
    if (!constraint && !equals) {
        return new PrimitiveValue(initialValue);
    }
    return new ComplexValue(initialValue, config);
}
function createReadonlyValue(value) {
    return [
        new ReadonlyPrimitiveValue(value),
        (rawValue, options) => {
            value.setRawValue(rawValue, options);
        },
    ];
}

class ValueMap {
    constructor(valueMap) {
        this.emitter = new Emitter();
        this.valMap_ = valueMap;
        for (const key in this.valMap_) {
            const v = this.valMap_[key];
            v.emitter.on('change', () => {
                this.emitter.emit('change', {
                    key: key,
                    sender: this,
                });
            });
        }
    }
    static createCore(initialValue) {
        const keys = Object.keys(initialValue);
        return keys.reduce((o, key) => {
            return Object.assign(o, {
                [key]: createValue(initialValue[key]),
            });
        }, {});
    }
    static fromObject(initialValue) {
        const core = this.createCore(initialValue);
        return new ValueMap(core);
    }
    get(key) {
        return this.valMap_[key].rawValue;
    }
    set(key, value) {
        this.valMap_[key].rawValue = value;
    }
    value(key) {
        return this.valMap_[key];
    }
}

class DefiniteRangeConstraint {
    constructor(config) {
        this.values = ValueMap.fromObject({
            max: config.max,
            min: config.min,
        });
    }
    constrain(value) {
        const max = this.values.get('max');
        const min = this.values.get('min');
        return Math.min(Math.max(value, min), max);
    }
}

class RangeConstraint {
    constructor(config) {
        this.values = ValueMap.fromObject({
            max: config.max,
            min: config.min,
        });
    }
    constrain(value) {
        const max = this.values.get('max');
        const min = this.values.get('min');
        let result = value;
        if (!isEmpty(min)) {
            result = Math.max(result, min);
        }
        if (!isEmpty(max)) {
            result = Math.min(result, max);
        }
        return result;
    }
}

class StepConstraint {
    constructor(step, origin = 0) {
        this.step = step;
        this.origin = origin;
    }
    constrain(value) {
        const o = this.origin % this.step;
        const r = Math.round((value - o) / this.step);
        return o + r * this.step;
    }
}

class NumberLiteralNode {
    constructor(text) {
        this.text = text;
    }
    evaluate() {
        return Number(this.text);
    }
    toString() {
        return this.text;
    }
}
const BINARY_OPERATION_MAP = {
    '**': (v1, v2) => Math.pow(v1, v2),
    '*': (v1, v2) => v1 * v2,
    '/': (v1, v2) => v1 / v2,
    '%': (v1, v2) => v1 % v2,
    '+': (v1, v2) => v1 + v2,
    '-': (v1, v2) => v1 - v2,
    '<<': (v1, v2) => v1 << v2,
    '>>': (v1, v2) => v1 >> v2,
    '>>>': (v1, v2) => v1 >>> v2,
    '&': (v1, v2) => v1 & v2,
    '^': (v1, v2) => v1 ^ v2,
    '|': (v1, v2) => v1 | v2,
};
class BinaryOperationNode {
    constructor(operator, left, right) {
        this.left = left;
        this.operator = operator;
        this.right = right;
    }
    evaluate() {
        const op = BINARY_OPERATION_MAP[this.operator];
        if (!op) {
            throw new Error(`unexpected binary operator: '${this.operator}`);
        }
        return op(this.left.evaluate(), this.right.evaluate());
    }
    toString() {
        return [
            'b(',
            this.left.toString(),
            this.operator,
            this.right.toString(),
            ')',
        ].join(' ');
    }
}
const UNARY_OPERATION_MAP = {
    '+': (v) => v,
    '-': (v) => -v,
    '~': (v) => ~v,
};
class UnaryOperationNode {
    constructor(operator, expr) {
        this.operator = operator;
        this.expression = expr;
    }
    evaluate() {
        const op = UNARY_OPERATION_MAP[this.operator];
        if (!op) {
            throw new Error(`unexpected unary operator: '${this.operator}`);
        }
        return op(this.expression.evaluate());
    }
    toString() {
        return ['u(', this.operator, this.expression.toString(), ')'].join(' ');
    }
}

function combineReader(parsers) {
    return (text, cursor) => {
        for (let i = 0; i < parsers.length; i++) {
            const result = parsers[i](text, cursor);
            if (result !== '') {
                return result;
            }
        }
        return '';
    };
}
function readWhitespace(text, cursor) {
    var _a;
    const m = text.substr(cursor).match(/^\s+/);
    return (_a = (m && m[0])) !== null && _a !== void 0 ? _a : '';
}
function readNonZeroDigit(text, cursor) {
    const ch = text.substr(cursor, 1);
    return ch.match(/^[1-9]$/) ? ch : '';
}
function readDecimalDigits(text, cursor) {
    var _a;
    const m = text.substr(cursor).match(/^[0-9]+/);
    return (_a = (m && m[0])) !== null && _a !== void 0 ? _a : '';
}
function readSignedInteger(text, cursor) {
    const ds = readDecimalDigits(text, cursor);
    if (ds !== '') {
        return ds;
    }
    const sign = text.substr(cursor, 1);
    cursor += 1;
    if (sign !== '-' && sign !== '+') {
        return '';
    }
    const sds = readDecimalDigits(text, cursor);
    if (sds === '') {
        return '';
    }
    return sign + sds;
}
function readExponentPart(text, cursor) {
    const e = text.substr(cursor, 1);
    cursor += 1;
    if (e.toLowerCase() !== 'e') {
        return '';
    }
    const si = readSignedInteger(text, cursor);
    if (si === '') {
        return '';
    }
    return e + si;
}
function readDecimalIntegerLiteral(text, cursor) {
    const ch = text.substr(cursor, 1);
    if (ch === '0') {
        return ch;
    }
    const nzd = readNonZeroDigit(text, cursor);
    cursor += nzd.length;
    if (nzd === '') {
        return '';
    }
    return nzd + readDecimalDigits(text, cursor);
}
function readDecimalLiteral1(text, cursor) {
    const dil = readDecimalIntegerLiteral(text, cursor);
    cursor += dil.length;
    if (dil === '') {
        return '';
    }
    const dot = text.substr(cursor, 1);
    cursor += dot.length;
    if (dot !== '.') {
        return '';
    }
    const dds = readDecimalDigits(text, cursor);
    cursor += dds.length;
    return dil + dot + dds + readExponentPart(text, cursor);
}
function readDecimalLiteral2(text, cursor) {
    const dot = text.substr(cursor, 1);
    cursor += dot.length;
    if (dot !== '.') {
        return '';
    }
    const dds = readDecimalDigits(text, cursor);
    cursor += dds.length;
    if (dds === '') {
        return '';
    }
    return dot + dds + readExponentPart(text, cursor);
}
function readDecimalLiteral3(text, cursor) {
    const dil = readDecimalIntegerLiteral(text, cursor);
    cursor += dil.length;
    if (dil === '') {
        return '';
    }
    return dil + readExponentPart(text, cursor);
}
const readDecimalLiteral = combineReader([
    readDecimalLiteral1,
    readDecimalLiteral2,
    readDecimalLiteral3,
]);
function parseBinaryDigits(text, cursor) {
    var _a;
    const m = text.substr(cursor).match(/^[01]+/);
    return (_a = (m && m[0])) !== null && _a !== void 0 ? _a : '';
}
function readBinaryIntegerLiteral(text, cursor) {
    const prefix = text.substr(cursor, 2);
    cursor += prefix.length;
    if (prefix.toLowerCase() !== '0b') {
        return '';
    }
    const bds = parseBinaryDigits(text, cursor);
    if (bds === '') {
        return '';
    }
    return prefix + bds;
}
function readOctalDigits(text, cursor) {
    var _a;
    const m = text.substr(cursor).match(/^[0-7]+/);
    return (_a = (m && m[0])) !== null && _a !== void 0 ? _a : '';
}
function readOctalIntegerLiteral(text, cursor) {
    const prefix = text.substr(cursor, 2);
    cursor += prefix.length;
    if (prefix.toLowerCase() !== '0o') {
        return '';
    }
    const ods = readOctalDigits(text, cursor);
    if (ods === '') {
        return '';
    }
    return prefix + ods;
}
function readHexDigits(text, cursor) {
    var _a;
    const m = text.substr(cursor).match(/^[0-9a-f]+/i);
    return (_a = (m && m[0])) !== null && _a !== void 0 ? _a : '';
}
function readHexIntegerLiteral(text, cursor) {
    const prefix = text.substr(cursor, 2);
    cursor += prefix.length;
    if (prefix.toLowerCase() !== '0x') {
        return '';
    }
    const hds = readHexDigits(text, cursor);
    if (hds === '') {
        return '';
    }
    return prefix + hds;
}
const readNonDecimalIntegerLiteral = combineReader([
    readBinaryIntegerLiteral,
    readOctalIntegerLiteral,
    readHexIntegerLiteral,
]);
const readNumericLiteral = combineReader([
    readNonDecimalIntegerLiteral,
    readDecimalLiteral,
]);

function parseLiteral(text, cursor) {
    const num = readNumericLiteral(text, cursor);
    cursor += num.length;
    if (num === '') {
        return null;
    }
    return {
        evaluable: new NumberLiteralNode(num),
        cursor: cursor,
    };
}
function parseParenthesizedExpression(text, cursor) {
    const op = text.substr(cursor, 1);
    cursor += op.length;
    if (op !== '(') {
        return null;
    }
    const expr = parseExpression(text, cursor);
    if (!expr) {
        return null;
    }
    cursor = expr.cursor;
    cursor += readWhitespace(text, cursor).length;
    const cl = text.substr(cursor, 1);
    cursor += cl.length;
    if (cl !== ')') {
        return null;
    }
    return {
        evaluable: expr.evaluable,
        cursor: cursor,
    };
}
function parsePrimaryExpression(text, cursor) {
    var _a;
    return ((_a = parseLiteral(text, cursor)) !== null && _a !== void 0 ? _a : parseParenthesizedExpression(text, cursor));
}
function parseUnaryExpression(text, cursor) {
    const expr = parsePrimaryExpression(text, cursor);
    if (expr) {
        return expr;
    }
    const op = text.substr(cursor, 1);
    cursor += op.length;
    if (op !== '+' && op !== '-' && op !== '~') {
        return null;
    }
    const num = parseUnaryExpression(text, cursor);
    if (!num) {
        return null;
    }
    cursor = num.cursor;
    return {
        cursor: cursor,
        evaluable: new UnaryOperationNode(op, num.evaluable),
    };
}
function readBinaryOperator(ops, text, cursor) {
    cursor += readWhitespace(text, cursor).length;
    const op = ops.filter((op) => text.startsWith(op, cursor))[0];
    if (!op) {
        return null;
    }
    cursor += op.length;
    cursor += readWhitespace(text, cursor).length;
    return {
        cursor: cursor,
        operator: op,
    };
}
function createBinaryOperationExpressionParser(exprParser, ops) {
    return (text, cursor) => {
        const firstExpr = exprParser(text, cursor);
        if (!firstExpr) {
            return null;
        }
        cursor = firstExpr.cursor;
        let expr = firstExpr.evaluable;
        for (;;) {
            const op = readBinaryOperator(ops, text, cursor);
            if (!op) {
                break;
            }
            cursor = op.cursor;
            const nextExpr = exprParser(text, cursor);
            if (!nextExpr) {
                return null;
            }
            cursor = nextExpr.cursor;
            expr = new BinaryOperationNode(op.operator, expr, nextExpr.evaluable);
        }
        return expr
            ? {
                cursor: cursor,
                evaluable: expr,
            }
            : null;
    };
}
const parseBinaryOperationExpression = [
    ['**'],
    ['*', '/', '%'],
    ['+', '-'],
    ['<<', '>>>', '>>'],
    ['&'],
    ['^'],
    ['|'],
].reduce((parser, ops) => {
    return createBinaryOperationExpressionParser(parser, ops);
}, parseUnaryExpression);
function parseExpression(text, cursor) {
    cursor += readWhitespace(text, cursor).length;
    return parseBinaryOperationExpression(text, cursor);
}
function parseEcmaNumberExpression(text) {
    const expr = parseExpression(text, 0);
    if (!expr) {
        return null;
    }
    const cursor = expr.cursor + readWhitespace(text, expr.cursor).length;
    if (cursor !== text.length) {
        return null;
    }
    return expr.evaluable;
}

function parseNumber(text) {
    var _a;
    const r = parseEcmaNumberExpression(text);
    return (_a = r === null || r === void 0 ? void 0 : r.evaluate()) !== null && _a !== void 0 ? _a : null;
}
function numberFromUnknown(value) {
    if (typeof value === 'number') {
        return value;
    }
    if (typeof value === 'string') {
        const pv = parseNumber(value);
        if (!isEmpty(pv)) {
            return pv;
        }
    }
    return 0;
}
function createNumberFormatter(digits) {
    return (value) => {
        return value.toFixed(Math.max(Math.min(digits, 20), 0));
    };
}

function mapRange(value, start1, end1, start2, end2) {
    const p = (value - start1) / (end1 - start1);
    return start2 + p * (end2 - start2);
}
function getDecimalDigits(value) {
    const text = String(value.toFixed(10));
    const frac = text.split('.')[1];
    return frac.replace(/0+$/, '').length;
}
function constrainRange(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
function loopRange(value, max) {
    return ((value % max) + max) % max;
}
function getSuitableDecimalDigits(params, rawValue) {
    return !isEmpty(params.step)
        ? getDecimalDigits(params.step)
        : Math.max(getDecimalDigits(rawValue), 2);
}
function getSuitableKeyScale(params) {
    var _a;
    return (_a = params.step) !== null && _a !== void 0 ? _a : 1;
}
function getSuitablePointerScale(params, rawValue) {
    var _a;
    const base = Math.abs((_a = params.step) !== null && _a !== void 0 ? _a : rawValue);
    return base === 0 ? 0.1 : Math.pow(10, Math.floor(Math.log10(base)) - 1);
}
function createStepConstraint(params, initialValue) {
    if (!isEmpty(params.step)) {
        return new StepConstraint(params.step, initialValue);
    }
    return null;
}
function createRangeConstraint(params) {
    if (!isEmpty(params.max) && !isEmpty(params.min)) {
        return new DefiniteRangeConstraint({
            max: params.max,
            min: params.min,
        });
    }
    if (!isEmpty(params.max) || !isEmpty(params.min)) {
        return new RangeConstraint({
            max: params.max,
            min: params.min,
        });
    }
    return null;
}
function createNumberTextPropsObject(params, initialValue) {
    var _a, _b, _c;
    return {
        formatter: (_a = params.format) !== null && _a !== void 0 ? _a : createNumberFormatter(getSuitableDecimalDigits(params, initialValue)),
        keyScale: (_b = params.keyScale) !== null && _b !== void 0 ? _b : getSuitableKeyScale(params),
        pointerScale: (_c = params.pointerScale) !== null && _c !== void 0 ? _c : getSuitablePointerScale(params, initialValue),
    };
}
function createNumberTextInputParamsParser(p) {
    return {
        format: p.optional.function,
        keyScale: p.optional.number,
        max: p.optional.number,
        min: p.optional.number,
        pointerScale: p.optional.number,
        step: p.optional.number,
    };
}

function createPointAxis(config) {
    return {
        constraint: config.constraint,
        textProps: ValueMap.fromObject(createNumberTextPropsObject(config.params, config.initialValue)),
    };
}

class BladeApi {
    constructor(controller) {
        this.controller = controller;
    }
    get element() {
        return this.controller.view.element;
    }
    get disabled() {
        return this.controller.viewProps.get('disabled');
    }
    set disabled(disabled) {
        this.controller.viewProps.set('disabled', disabled);
    }
    get hidden() {
        return this.controller.viewProps.get('hidden');
    }
    set hidden(hidden) {
        this.controller.viewProps.set('hidden', hidden);
    }
    dispose() {
        this.controller.viewProps.set('disposed', true);
    }
    importState(state) {
        return this.controller.importState(state);
    }
    exportState() {
        return this.controller.exportState();
    }
}

class TpEvent {
    constructor(target) {
        this.target = target;
    }
}
class TpChangeEvent extends TpEvent {
    constructor(target, value, last) {
        super(target);
        this.value = value;
        this.last = last !== null && last !== void 0 ? last : true;
    }
}
class TpFoldEvent extends TpEvent {
    constructor(target, expanded) {
        super(target);
        this.expanded = expanded;
    }
}
class TpTabSelectEvent extends TpEvent {
    constructor(target, index) {
        super(target);
        this.index = index;
    }
}
class TpMouseEvent extends TpEvent {
    constructor(target, nativeEvent) {
        super(target);
        this.native = nativeEvent;
    }
}

class BindingApi extends BladeApi {
    constructor(controller) {
        super(controller);
        this.onValueChange_ = this.onValueChange_.bind(this);
        this.emitter_ = new Emitter();
        this.controller.value.emitter.on('change', this.onValueChange_);
    }
    get label() {
        return this.controller.labelController.props.get('label');
    }
    set label(label) {
        this.controller.labelController.props.set('label', label);
    }
    get key() {
        return this.controller.value.binding.target.key;
    }
    get tag() {
        return this.controller.tag;
    }
    set tag(tag) {
        this.controller.tag = tag;
    }
    on(eventName, handler) {
        const bh = handler.bind(this);
        this.emitter_.on(eventName, (ev) => {
            bh(ev);
        }, {
            key: handler,
        });
        return this;
    }
    off(eventName, handler) {
        this.emitter_.off(eventName, handler);
        return this;
    }
    refresh() {
        this.controller.value.fetch();
    }
    onValueChange_(ev) {
        const value = this.controller.value;
        this.emitter_.emit('change', new TpChangeEvent(this, forceCast(value.binding.target.read()), ev.options.last));
    }
}

function parseObject(value, keyToParserMap) {
    const keys = Object.keys(keyToParserMap);
    const result = keys.reduce((tmp, key) => {
        if (tmp === undefined) {
            return undefined;
        }
        const parser = keyToParserMap[key];
        const result = parser(value[key]);
        return result.succeeded
            ? Object.assign(Object.assign({}, tmp), { [key]: result.value }) : undefined;
    }, {});
    return forceCast(result);
}
function parseArray(value, parseItem) {
    return value.reduce((tmp, item) => {
        if (tmp === undefined) {
            return undefined;
        }
        const result = parseItem(item);
        if (!result.succeeded || result.value === undefined) {
            return undefined;
        }
        return [...tmp, result.value];
    }, []);
}
function isObject(value) {
    if (value === null) {
        return false;
    }
    return typeof value === 'object';
}
function createMicroParserBuilder(parse) {
    return (optional) => (v) => {
        if (!optional && v === undefined) {
            return {
                succeeded: false,
                value: undefined,
            };
        }
        if (optional && v === undefined) {
            return {
                succeeded: true,
                value: undefined,
            };
        }
        const result = parse(v);
        return result !== undefined
            ? {
                succeeded: true,
                value: result,
            }
            : {
                succeeded: false,
                value: undefined,
            };
    };
}
function createMicroParserBuilders(optional) {
    return {
        custom: (parse) => createMicroParserBuilder(parse)(optional),
        boolean: createMicroParserBuilder((v) => typeof v === 'boolean' ? v : undefined)(optional),
        number: createMicroParserBuilder((v) => typeof v === 'number' ? v : undefined)(optional),
        string: createMicroParserBuilder((v) => typeof v === 'string' ? v : undefined)(optional),
        function: createMicroParserBuilder((v) =>
        typeof v === 'function' ? v : undefined)(optional),
        constant: (value) => createMicroParserBuilder((v) => (v === value ? value : undefined))(optional),
        raw: createMicroParserBuilder((v) => v)(optional),
        object: (keyToParserMap) => createMicroParserBuilder((v) => {
            if (!isObject(v)) {
                return undefined;
            }
            return parseObject(v, keyToParserMap);
        })(optional),
        array: (itemParser) => createMicroParserBuilder((v) => {
            if (!Array.isArray(v)) {
                return undefined;
            }
            return parseArray(v, itemParser);
        })(optional),
    };
}
const MicroParsers = {
    optional: createMicroParserBuilders(true),
    required: createMicroParserBuilders(false),
};
function parseRecord(value, keyToParserMap) {
    const map = keyToParserMap(MicroParsers);
    const result = MicroParsers.required.object(map)(value);
    return result.succeeded ? result.value : undefined;
}

function importBladeState(state, superImport, parser, callback) {
    if (superImport && !superImport(state)) {
        return false;
    }
    const result = parseRecord(state, parser);
    return result ? callback(result) : false;
}
function exportBladeState(superExport, thisState) {
    var _a;
    return deepMerge((_a = superExport === null || superExport === void 0 ? void 0 : superExport()) !== null && _a !== void 0 ? _a : {}, thisState);
}

function isValueBladeController(bc) {
    return 'value' in bc;
}

function isBindingValue(v) {
    if (!isObject$1(v) || !('binding' in v)) {
        return false;
    }
    const b = v.binding;
    return isBinding(b);
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function forceReflow(element) {
    element.offsetHeight;
}
function disableTransitionTemporarily(element, callback) {
    const t = element.style.transition;
    element.style.transition = 'none';
    callback();
    element.style.transition = t;
}
function supportsTouch(doc) {
    return doc.ontouchstart !== undefined;
}
function getCanvasContext(canvasElement) {
    const win = canvasElement.ownerDocument.defaultView;
    if (!win) {
        return null;
    }
    const isBrowser = 'document' in win;
    return isBrowser
        ? canvasElement.getContext('2d', {
            willReadFrequently: true,
        })
        : null;
}
const ICON_ID_TO_INNER_HTML_MAP = {
    check: '<path d="M2 8l4 4l8 -8"/>',
    dropdown: '<path d="M5 7h6l-3 3 z"/>',
    p2dpad: '<path d="M8 4v8"/><path d="M4 8h8"/><circle cx="12" cy="12" r="1.2"/>',
};
function createSvgIconElement(document, iconId) {
    const elem = document.createElementNS(SVG_NS, 'svg');
    elem.innerHTML = ICON_ID_TO_INNER_HTML_MAP[iconId];
    return elem;
}
function insertElementAt(parentElement, element, index) {
    parentElement.insertBefore(element, parentElement.children[index]);
}
function removeElement(element) {
    if (element.parentElement) {
        element.parentElement.removeChild(element);
    }
}
function removeChildElements(element) {
    while (element.children.length > 0) {
        element.removeChild(element.children[0]);
    }
}
function removeChildNodes(element) {
    while (element.childNodes.length > 0) {
        element.removeChild(element.childNodes[0]);
    }
}
function findNextTarget(ev) {
    if (ev.relatedTarget) {
        return forceCast(ev.relatedTarget);
    }
    if ('explicitOriginalTarget' in ev) {
        return ev.explicitOriginalTarget;
    }
    return null;
}

function bindValue(value, applyValue) {
    value.emitter.on('change', (ev) => {
        applyValue(ev.rawValue);
    });
    applyValue(value.rawValue);
}
function bindValueMap(valueMap, key, applyValue) {
    bindValue(valueMap.value(key), applyValue);
}

const PREFIX = 'tp';
function ClassName(viewName) {
    const fn = (opt_elementName, opt_modifier) => {
        return [
            PREFIX,
            '-',
            viewName,
            'v',
            opt_elementName ? `_${opt_elementName}` : '',
            opt_modifier ? `-${opt_modifier}` : '',
        ].join('');
    };
    return fn;
}

const cn$s = ClassName('lbl');
function createLabelNode(doc, label) {
    const frag = doc.createDocumentFragment();
    const lineNodes = label.split('\n').map((line) => {
        return doc.createTextNode(line);
    });
    lineNodes.forEach((lineNode, index) => {
        if (index > 0) {
            frag.appendChild(doc.createElement('br'));
        }
        frag.appendChild(lineNode);
    });
    return frag;
}
class LabelView {
    constructor(doc, config) {
        this.element = doc.createElement('div');
        this.element.classList.add(cn$s());
        config.viewProps.bindClassModifiers(this.element);
        const labelElem = doc.createElement('div');
        labelElem.classList.add(cn$s('l'));
        bindValueMap(config.props, 'label', (value) => {
            if (isEmpty(value)) {
                this.element.classList.add(cn$s(undefined, 'nol'));
            }
            else {
                this.element.classList.remove(cn$s(undefined, 'nol'));
                removeChildNodes(labelElem);
                labelElem.appendChild(createLabelNode(doc, value));
            }
        });
        this.element.appendChild(labelElem);
        this.labelElement = labelElem;
        const valueElem = doc.createElement('div');
        valueElem.classList.add(cn$s('v'));
        this.element.appendChild(valueElem);
        this.valueElement = valueElem;
    }
}

class LabelController {
    constructor(doc, config) {
        this.props = config.props;
        this.valueController = config.valueController;
        this.viewProps = config.valueController.viewProps;
        this.view = new LabelView(doc, {
            props: config.props,
            viewProps: this.viewProps,
        });
        this.view.valueElement.appendChild(this.valueController.view.element);
    }
    importProps(state) {
        return importBladeState(state, null, (p) => ({
            label: p.optional.string,
        }), (result) => {
            this.props.set('label', result.label);
            return true;
        });
    }
    exportProps() {
        return exportBladeState(null, {
            label: this.props.get('label'),
        });
    }
}

function getAllBladePositions() {
    return ['veryfirst', 'first', 'last', 'verylast'];
}

const cn$r = ClassName('');
const POS_TO_CLASS_NAME_MAP = {
    veryfirst: 'vfst',
    first: 'fst',
    last: 'lst',
    verylast: 'vlst',
};
class BladeController {
    constructor(config) {
        this.parent_ = null;
        this.blade = config.blade;
        this.view = config.view;
        this.viewProps = config.viewProps;
        const elem = this.view.element;
        this.blade.value('positions').emitter.on('change', () => {
            getAllBladePositions().forEach((pos) => {
                elem.classList.remove(cn$r(undefined, POS_TO_CLASS_NAME_MAP[pos]));
            });
            this.blade.get('positions').forEach((pos) => {
                elem.classList.add(cn$r(undefined, POS_TO_CLASS_NAME_MAP[pos]));
            });
        });
        this.viewProps.handleDispose(() => {
            removeElement(elem);
        });
    }
    get parent() {
        return this.parent_;
    }
    set parent(parent) {
        this.parent_ = parent;
        this.viewProps.set('parent', this.parent_ ? this.parent_.viewProps : null);
    }
    importState(state) {
        return importBladeState(state, null, (p) => ({
            disabled: p.required.boolean,
            hidden: p.required.boolean,
        }), (result) => {
            this.viewProps.importState(result);
            return true;
        });
    }
    exportState() {
        return exportBladeState(null, Object.assign({}, this.viewProps.exportState()));
    }
}

class ButtonApi extends BladeApi {
    get label() {
        return this.controller.labelController.props.get('label');
    }
    set label(label) {
        this.controller.labelController.props.set('label', label);
    }
    get title() {
        var _a;
        return (_a = this.controller.buttonController.props.get('title')) !== null && _a !== void 0 ? _a : '';
    }
    set title(title) {
        this.controller.buttonController.props.set('title', title);
    }
    on(eventName, handler) {
        const bh = handler.bind(this);
        const emitter = this.controller.buttonController.emitter;
        emitter.on(eventName, (ev) => {
            bh(new TpMouseEvent(this, ev.nativeEvent));
        });
        return this;
    }
    off(eventName, handler) {
        const emitter = this.controller.buttonController.emitter;
        emitter.off(eventName, handler);
        return this;
    }
}

function applyClass(elem, className, active) {
    if (active) {
        elem.classList.add(className);
    }
    else {
        elem.classList.remove(className);
    }
}
function valueToClassName(elem, className) {
    return (value) => {
        applyClass(elem, className, value);
    };
}
function bindValueToTextContent(value, elem) {
    bindValue(value, (text) => {
        elem.textContent = text !== null && text !== void 0 ? text : '';
    });
}

const cn$q = ClassName('btn');
class ButtonView {
    constructor(doc, config) {
        this.element = doc.createElement('div');
        this.element.classList.add(cn$q());
        config.viewProps.bindClassModifiers(this.element);
        const buttonElem = doc.createElement('button');
        buttonElem.classList.add(cn$q('b'));
        config.viewProps.bindDisabled(buttonElem);
        this.element.appendChild(buttonElem);
        this.buttonElement = buttonElem;
        const titleElem = doc.createElement('div');
        titleElem.classList.add(cn$q('t'));
        bindValueToTextContent(config.props.value('title'), titleElem);
        this.buttonElement.appendChild(titleElem);
    }
}

class ButtonController {
    constructor(doc, config) {
        this.emitter = new Emitter();
        this.onClick_ = this.onClick_.bind(this);
        this.props = config.props;
        this.viewProps = config.viewProps;
        this.view = new ButtonView(doc, {
            props: this.props,
            viewProps: this.viewProps,
        });
        this.view.buttonElement.addEventListener('click', this.onClick_);
    }
    importProps(state) {
        return importBladeState(state, null, (p) => ({
            title: p.optional.string,
        }), (result) => {
            this.props.set('title', result.title);
            return true;
        });
    }
    exportProps() {
        return exportBladeState(null, {
            title: this.props.get('title'),
        });
    }
    onClick_(ev) {
        this.emitter.emit('click', {
            nativeEvent: ev,
            sender: this,
        });
    }
}

class ButtonBladeController extends BladeController {
    constructor(doc, config) {
        const bc = new ButtonController(doc, {
            props: config.buttonProps,
            viewProps: config.viewProps,
        });
        const lc = new LabelController(doc, {
            blade: config.blade,
            props: config.labelProps,
            valueController: bc,
        });
        super({
            blade: config.blade,
            view: lc.view,
            viewProps: config.viewProps,
        });
        this.buttonController = bc;
        this.labelController = lc;
    }
    importState(state) {
        return importBladeState(state, (s) => super.importState(s) &&
            this.buttonController.importProps(s) &&
            this.labelController.importProps(s), () => ({}), () => true);
    }
    exportState() {
        return exportBladeState(() => super.exportState(), Object.assign(Object.assign({}, this.buttonController.exportProps()), this.labelController.exportProps()));
    }
}

class Semver {
    constructor(text) {
        const [core, prerelease] = text.split('-');
        const coreComps = core.split('.');
        this.major = parseInt(coreComps[0], 10);
        this.minor = parseInt(coreComps[1], 10);
        this.patch = parseInt(coreComps[2], 10);
        this.prerelease = prerelease !== null && prerelease !== void 0 ? prerelease : null;
    }
    toString() {
        const core = [this.major, this.minor, this.patch].join('.');
        return this.prerelease !== null ? [core, this.prerelease].join('-') : core;
    }
}

const VERSION = new Semver('2.0.5');

function createPlugin(plugin) {
    return Object.assign({ core: VERSION }, plugin);
}

createPlugin({
    id: 'button',
    type: 'blade',
    accept(params) {
        const result = parseRecord(params, (p) => ({
            title: p.required.string,
            view: p.required.constant('button'),
            label: p.optional.string,
        }));
        return result ? { params: result } : null;
    },
    controller(args) {
        return new ButtonBladeController(args.document, {
            blade: args.blade,
            buttonProps: ValueMap.fromObject({
                title: args.params.title,
            }),
            labelProps: ValueMap.fromObject({
                label: args.params.label,
            }),
            viewProps: args.viewProps,
        });
    },
    api(args) {
        if (args.controller instanceof ButtonBladeController) {
            return new ButtonApi(args.controller);
        }
        return null;
    },
});

function addButtonAsBlade(api, params) {
    return api.addBlade(Object.assign(Object.assign({}, params), { view: 'button' }));
}
function addFolderAsBlade(api, params) {
    return api.addBlade(Object.assign(Object.assign({}, params), { view: 'folder' }));
}
function addTabAsBlade(api, params) {
    return api.addBlade(Object.assign(Object.assign({}, params), { view: 'tab' }));
}

function isRefreshable(value) {
    if (!isObject$1(value)) {
        return false;
    }
    return 'refresh' in value && typeof value.refresh === 'function';
}

function createBindingTarget(obj, key) {
    if (!BindingTarget.isBindable(obj)) {
        throw TpError.notBindable();
    }
    return new BindingTarget(obj, key);
}
class RackApi {
    constructor(controller, pool) {
        this.onRackValueChange_ = this.onRackValueChange_.bind(this);
        this.controller_ = controller;
        this.emitter_ = new Emitter();
        this.pool_ = pool;
        const rack = this.controller_.rack;
        rack.emitter.on('valuechange', this.onRackValueChange_);
    }
    get children() {
        return this.controller_.rack.children.map((bc) => this.pool_.createApi(bc));
    }
    addBinding(object, key, opt_params) {
        const params = opt_params !== null && opt_params !== void 0 ? opt_params : {};
        const doc = this.controller_.element.ownerDocument;
        const bc = this.pool_.createBinding(doc, createBindingTarget(object, key), params);
        const api = this.pool_.createBindingApi(bc);
        return this.add(api, params.index);
    }
    addFolder(params) {
        return addFolderAsBlade(this, params);
    }
    addButton(params) {
        return addButtonAsBlade(this, params);
    }
    addTab(params) {
        return addTabAsBlade(this, params);
    }
    add(api, opt_index) {
        const bc = api.controller;
        this.controller_.rack.add(bc, opt_index);
        return api;
    }
    remove(api) {
        this.controller_.rack.remove(api.controller);
    }
    addBlade(params) {
        const doc = this.controller_.element.ownerDocument;
        const bc = this.pool_.createBlade(doc, params);
        const api = this.pool_.createApi(bc);
        return this.add(api, params.index);
    }
    on(eventName, handler) {
        const bh = handler.bind(this);
        this.emitter_.on(eventName, (ev) => {
            bh(ev);
        }, {
            key: handler,
        });
        return this;
    }
    off(eventName, handler) {
        this.emitter_.off(eventName, handler);
        return this;
    }
    refresh() {
        this.children.forEach((c) => {
            if (isRefreshable(c)) {
                c.refresh();
            }
        });
    }
    onRackValueChange_(ev) {
        const bc = ev.bladeController;
        const api = this.pool_.createApi(bc);
        const binding = isBindingValue(bc.value) ? bc.value.binding : null;
        this.emitter_.emit('change', new TpChangeEvent(api, binding ? binding.target.read() : bc.value.rawValue, ev.options.last));
    }
}

class ContainerBladeApi extends BladeApi {
    constructor(controller, pool) {
        super(controller);
        this.rackApi_ = new RackApi(controller.rackController, pool);
    }
    refresh() {
        this.rackApi_.refresh();
    }
}

class ContainerBladeController extends BladeController {
    constructor(config) {
        super({
            blade: config.blade,
            view: config.view,
            viewProps: config.rackController.viewProps,
        });
        this.rackController = config.rackController;
    }
    importState(state) {
        return importBladeState(state, (s) => super.importState(s), (p) => ({
            children: p.required.array(p.required.raw),
        }), (result) => {
            return this.rackController.rack.children.every((c, index) => {
                return c.importState(result.children[index]);
            });
        });
    }
    exportState() {
        return exportBladeState(() => super.exportState(), {
            children: this.rackController.rack.children.map((c) => c.exportState()),
        });
    }
}
function isContainerBladeController(bc) {
    return 'rackController' in bc;
}

class NestedOrderedSet {
    constructor(extract) {
        this.emitter = new Emitter();
        this.items_ = [];
        this.cache_ = new Set();
        this.onSubListAdd_ = this.onSubListAdd_.bind(this);
        this.onSubListRemove_ = this.onSubListRemove_.bind(this);
        this.extract_ = extract;
    }
    get items() {
        return this.items_;
    }
    allItems() {
        return Array.from(this.cache_);
    }
    find(callback) {
        for (const item of this.allItems()) {
            if (callback(item)) {
                return item;
            }
        }
        return null;
    }
    includes(item) {
        return this.cache_.has(item);
    }
    add(item, opt_index) {
        if (this.includes(item)) {
            throw TpError.shouldNeverHappen();
        }
        const index = opt_index !== undefined ? opt_index : this.items_.length;
        this.items_.splice(index, 0, item);
        this.cache_.add(item);
        const subList = this.extract_(item);
        if (subList) {
            subList.emitter.on('add', this.onSubListAdd_);
            subList.emitter.on('remove', this.onSubListRemove_);
            subList.allItems().forEach((i) => {
                this.cache_.add(i);
            });
        }
        this.emitter.emit('add', {
            index: index,
            item: item,
            root: this,
            target: this,
        });
    }
    remove(item) {
        const index = this.items_.indexOf(item);
        if (index < 0) {
            return;
        }
        this.items_.splice(index, 1);
        this.cache_.delete(item);
        const subList = this.extract_(item);
        if (subList) {
            subList.allItems().forEach((i) => {
                this.cache_.delete(i);
            });
            subList.emitter.off('add', this.onSubListAdd_);
            subList.emitter.off('remove', this.onSubListRemove_);
        }
        this.emitter.emit('remove', {
            index: index,
            item: item,
            root: this,
            target: this,
        });
    }
    onSubListAdd_(ev) {
        this.cache_.add(ev.item);
        this.emitter.emit('add', {
            index: ev.index,
            item: ev.item,
            root: this,
            target: ev.target,
        });
    }
    onSubListRemove_(ev) {
        this.cache_.delete(ev.item);
        this.emitter.emit('remove', {
            index: ev.index,
            item: ev.item,
            root: this,
            target: ev.target,
        });
    }
}

function findValueBladeController(bcs, v) {
    for (let i = 0; i < bcs.length; i++) {
        const bc = bcs[i];
        if (isValueBladeController(bc) && bc.value === v) {
            return bc;
        }
    }
    return null;
}
function findSubBladeControllerSet(bc) {
    return isContainerBladeController(bc)
        ? bc.rackController.rack['bcSet_']
        : null;
}
class Rack {
    constructor(config) {
        var _a, _b;
        this.emitter = new Emitter();
        this.onBladePositionsChange_ = this.onBladePositionsChange_.bind(this);
        this.onSetAdd_ = this.onSetAdd_.bind(this);
        this.onSetRemove_ = this.onSetRemove_.bind(this);
        this.onChildDispose_ = this.onChildDispose_.bind(this);
        this.onChildPositionsChange_ = this.onChildPositionsChange_.bind(this);
        this.onChildValueChange_ = this.onChildValueChange_.bind(this);
        this.onChildViewPropsChange_ = this.onChildViewPropsChange_.bind(this);
        this.onRackLayout_ = this.onRackLayout_.bind(this);
        this.onRackValueChange_ = this.onRackValueChange_.bind(this);
        this.blade_ = (_a = config.blade) !== null && _a !== void 0 ? _a : null;
        (_b = this.blade_) === null || _b === void 0 ? void 0 : _b.value('positions').emitter.on('change', this.onBladePositionsChange_);
        this.viewProps = config.viewProps;
        this.bcSet_ = new NestedOrderedSet(findSubBladeControllerSet);
        this.bcSet_.emitter.on('add', this.onSetAdd_);
        this.bcSet_.emitter.on('remove', this.onSetRemove_);
    }
    get children() {
        return this.bcSet_.items;
    }
    add(bc, opt_index) {
        var _a;
        (_a = bc.parent) === null || _a === void 0 ? void 0 : _a.remove(bc);
        bc.parent = this;
        this.bcSet_.add(bc, opt_index);
    }
    remove(bc) {
        bc.parent = null;
        this.bcSet_.remove(bc);
    }
    find(finder) {
        return this.bcSet_.allItems().filter(finder);
    }
    onSetAdd_(ev) {
        this.updatePositions_();
        const root = ev.target === ev.root;
        this.emitter.emit('add', {
            bladeController: ev.item,
            index: ev.index,
            root: root,
            sender: this,
        });
        if (!root) {
            return;
        }
        const bc = ev.item;
        bc.viewProps.emitter.on('change', this.onChildViewPropsChange_);
        bc.blade
            .value('positions')
            .emitter.on('change', this.onChildPositionsChange_);
        bc.viewProps.handleDispose(this.onChildDispose_);
        if (isValueBladeController(bc)) {
            bc.value.emitter.on('change', this.onChildValueChange_);
        }
        else if (isContainerBladeController(bc)) {
            const rack = bc.rackController.rack;
            if (rack) {
                const emitter = rack.emitter;
                emitter.on('layout', this.onRackLayout_);
                emitter.on('valuechange', this.onRackValueChange_);
            }
        }
    }
    onSetRemove_(ev) {
        this.updatePositions_();
        const root = ev.target === ev.root;
        this.emitter.emit('remove', {
            bladeController: ev.item,
            root: root,
            sender: this,
        });
        if (!root) {
            return;
        }
        const bc = ev.item;
        if (isValueBladeController(bc)) {
            bc.value.emitter.off('change', this.onChildValueChange_);
        }
        else if (isContainerBladeController(bc)) {
            const rack = bc.rackController.rack;
            if (rack) {
                const emitter = rack.emitter;
                emitter.off('layout', this.onRackLayout_);
                emitter.off('valuechange', this.onRackValueChange_);
            }
        }
    }
    updatePositions_() {
        const visibleItems = this.bcSet_.items.filter((bc) => !bc.viewProps.get('hidden'));
        const firstVisibleItem = visibleItems[0];
        const lastVisibleItem = visibleItems[visibleItems.length - 1];
        this.bcSet_.items.forEach((bc) => {
            const ps = [];
            if (bc === firstVisibleItem) {
                ps.push('first');
                if (!this.blade_ ||
                    this.blade_.get('positions').includes('veryfirst')) {
                    ps.push('veryfirst');
                }
            }
            if (bc === lastVisibleItem) {
                ps.push('last');
                if (!this.blade_ || this.blade_.get('positions').includes('verylast')) {
                    ps.push('verylast');
                }
            }
            bc.blade.set('positions', ps);
        });
    }
    onChildPositionsChange_() {
        this.updatePositions_();
        this.emitter.emit('layout', {
            sender: this,
        });
    }
    onChildViewPropsChange_(_ev) {
        this.updatePositions_();
        this.emitter.emit('layout', {
            sender: this,
        });
    }
    onChildDispose_() {
        const disposedUcs = this.bcSet_.items.filter((bc) => {
            return bc.viewProps.get('disposed');
        });
        disposedUcs.forEach((bc) => {
            this.bcSet_.remove(bc);
        });
    }
    onChildValueChange_(ev) {
        const bc = findValueBladeController(this.find(isValueBladeController), ev.sender);
        if (!bc) {
            throw TpError.alreadyDisposed();
        }
        this.emitter.emit('valuechange', {
            bladeController: bc,
            options: ev.options,
            sender: this,
        });
    }
    onRackLayout_(_) {
        this.updatePositions_();
        this.emitter.emit('layout', {
            sender: this,
        });
    }
    onRackValueChange_(ev) {
        this.emitter.emit('valuechange', {
            bladeController: ev.bladeController,
            options: ev.options,
            sender: this,
        });
    }
    onBladePositionsChange_() {
        this.updatePositions_();
    }
}

class RackController {
    constructor(config) {
        this.onRackAdd_ = this.onRackAdd_.bind(this);
        this.onRackRemove_ = this.onRackRemove_.bind(this);
        this.element = config.element;
        this.viewProps = config.viewProps;
        const rack = new Rack({
            blade: config.root ? undefined : config.blade,
            viewProps: config.viewProps,
        });
        rack.emitter.on('add', this.onRackAdd_);
        rack.emitter.on('remove', this.onRackRemove_);
        this.rack = rack;
        this.viewProps.handleDispose(() => {
            for (let i = this.rack.children.length - 1; i >= 0; i--) {
                const bc = this.rack.children[i];
                bc.viewProps.set('disposed', true);
            }
        });
    }
    onRackAdd_(ev) {
        if (!ev.root) {
            return;
        }
        insertElementAt(this.element, ev.bladeController.view.element, ev.index);
    }
    onRackRemove_(ev) {
        if (!ev.root) {
            return;
        }
        removeElement(ev.bladeController.view.element);
    }
}

function createBlade() {
    return new ValueMap({
        positions: createValue([], {
            equals: deepEqualsArray,
        }),
    });
}

class Foldable extends ValueMap {
    constructor(valueMap) {
        super(valueMap);
    }
    static create(expanded) {
        const coreObj = {
            completed: true,
            expanded: expanded,
            expandedHeight: null,
            shouldFixHeight: false,
            temporaryExpanded: null,
        };
        const core = ValueMap.createCore(coreObj);
        return new Foldable(core);
    }
    get styleExpanded() {
        var _a;
        return (_a = this.get('temporaryExpanded')) !== null && _a !== void 0 ? _a : this.get('expanded');
    }
    get styleHeight() {
        if (!this.styleExpanded) {
            return '0';
        }
        const exHeight = this.get('expandedHeight');
        if (this.get('shouldFixHeight') && !isEmpty(exHeight)) {
            return `${exHeight}px`;
        }
        return 'auto';
    }
    bindExpandedClass(elem, expandedClassName) {
        const onExpand = () => {
            const expanded = this.styleExpanded;
            if (expanded) {
                elem.classList.add(expandedClassName);
            }
            else {
                elem.classList.remove(expandedClassName);
            }
        };
        bindValueMap(this, 'expanded', onExpand);
        bindValueMap(this, 'temporaryExpanded', onExpand);
    }
    cleanUpTransition() {
        this.set('shouldFixHeight', false);
        this.set('expandedHeight', null);
        this.set('completed', true);
    }
}
function computeExpandedFolderHeight(folder, containerElement) {
    let height = 0;
    disableTransitionTemporarily(containerElement, () => {
        folder.set('expandedHeight', null);
        folder.set('temporaryExpanded', true);
        forceReflow(containerElement);
        height = containerElement.clientHeight;
        folder.set('temporaryExpanded', null);
        forceReflow(containerElement);
    });
    return height;
}
function applyHeight(foldable, elem) {
    elem.style.height = foldable.styleHeight;
}
function bindFoldable(foldable, elem) {
    foldable.value('expanded').emitter.on('beforechange', () => {
        foldable.set('completed', false);
        if (isEmpty(foldable.get('expandedHeight'))) {
            const h = computeExpandedFolderHeight(foldable, elem);
            if (h > 0) {
                foldable.set('expandedHeight', h);
            }
        }
        foldable.set('shouldFixHeight', true);
        forceReflow(elem);
    });
    foldable.emitter.on('change', () => {
        applyHeight(foldable, elem);
    });
    applyHeight(foldable, elem);
    elem.addEventListener('transitionend', (ev) => {
        if (ev.propertyName !== 'height') {
            return;
        }
        foldable.cleanUpTransition();
    });
}

class FolderApi extends ContainerBladeApi {
    constructor(controller, pool) {
        super(controller, pool);
        this.emitter_ = new Emitter();
        this.controller.foldable
            .value('expanded')
            .emitter.on('change', (ev) => {
            this.emitter_.emit('fold', new TpFoldEvent(this, ev.sender.rawValue));
        });
        this.rackApi_.on('change', (ev) => {
            this.emitter_.emit('change', ev);
        });
    }
    get expanded() {
        return this.controller.foldable.get('expanded');
    }
    set expanded(expanded) {
        this.controller.foldable.set('expanded', expanded);
    }
    get title() {
        return this.controller.props.get('title');
    }
    set title(title) {
        this.controller.props.set('title', title);
    }
    get children() {
        return this.rackApi_.children;
    }
    addBinding(object, key, opt_params) {
        return this.rackApi_.addBinding(object, key, opt_params);
    }
    addFolder(params) {
        return this.rackApi_.addFolder(params);
    }
    addButton(params) {
        return this.rackApi_.addButton(params);
    }
    addTab(params) {
        return this.rackApi_.addTab(params);
    }
    add(api, opt_index) {
        return this.rackApi_.add(api, opt_index);
    }
    remove(api) {
        this.rackApi_.remove(api);
    }
    addBlade(params) {
        return this.rackApi_.addBlade(params);
    }
    on(eventName, handler) {
        const bh = handler.bind(this);
        this.emitter_.on(eventName, (ev) => {
            bh(ev);
        }, {
            key: handler,
        });
        return this;
    }
    off(eventName, handler) {
        this.emitter_.off(eventName, handler);
        return this;
    }
}

const bladeContainerClassName = ClassName('cnt');

class FolderView {
    constructor(doc, config) {
        var _a;
        this.className_ = ClassName((_a = config.viewName) !== null && _a !== void 0 ? _a : 'fld');
        this.element = doc.createElement('div');
        this.element.classList.add(this.className_(), bladeContainerClassName());
        config.viewProps.bindClassModifiers(this.element);
        this.foldable_ = config.foldable;
        this.foldable_.bindExpandedClass(this.element, this.className_(undefined, 'expanded'));
        bindValueMap(this.foldable_, 'completed', valueToClassName(this.element, this.className_(undefined, 'cpl')));
        const buttonElem = doc.createElement('button');
        buttonElem.classList.add(this.className_('b'));
        bindValueMap(config.props, 'title', (title) => {
            if (isEmpty(title)) {
                this.element.classList.add(this.className_(undefined, 'not'));
            }
            else {
                this.element.classList.remove(this.className_(undefined, 'not'));
            }
        });
        config.viewProps.bindDisabled(buttonElem);
        this.element.appendChild(buttonElem);
        this.buttonElement = buttonElem;
        const indentElem = doc.createElement('div');
        indentElem.classList.add(this.className_('i'));
        this.element.appendChild(indentElem);
        const titleElem = doc.createElement('div');
        titleElem.classList.add(this.className_('t'));
        bindValueToTextContent(config.props.value('title'), titleElem);
        this.buttonElement.appendChild(titleElem);
        this.titleElement = titleElem;
        const markElem = doc.createElement('div');
        markElem.classList.add(this.className_('m'));
        this.buttonElement.appendChild(markElem);
        const containerElem = doc.createElement('div');
        containerElem.classList.add(this.className_('c'));
        this.element.appendChild(containerElem);
        this.containerElement = containerElem;
    }
}

class FolderController extends ContainerBladeController {
    constructor(doc, config) {
        var _a;
        const foldable = Foldable.create((_a = config.expanded) !== null && _a !== void 0 ? _a : true);
        const view = new FolderView(doc, {
            foldable: foldable,
            props: config.props,
            viewName: config.root ? 'rot' : undefined,
            viewProps: config.viewProps,
        });
        super(Object.assign(Object.assign({}, config), { rackController: new RackController({
                blade: config.blade,
                element: view.containerElement,
                root: config.root,
                viewProps: config.viewProps,
            }), view: view }));
        this.onTitleClick_ = this.onTitleClick_.bind(this);
        this.props = config.props;
        this.foldable = foldable;
        bindFoldable(this.foldable, this.view.containerElement);
        this.rackController.rack.emitter.on('add', () => {
            this.foldable.cleanUpTransition();
        });
        this.rackController.rack.emitter.on('remove', () => {
            this.foldable.cleanUpTransition();
        });
        this.view.buttonElement.addEventListener('click', this.onTitleClick_);
    }
    get document() {
        return this.view.element.ownerDocument;
    }
    importState(state) {
        return importBladeState(state, (s) => super.importState(s), (p) => ({
            expanded: p.required.boolean,
            title: p.optional.string,
        }), (result) => {
            this.foldable.set('expanded', result.expanded);
            this.props.set('title', result.title);
            return true;
        });
    }
    exportState() {
        return exportBladeState(() => super.exportState(), {
            expanded: this.foldable.get('expanded'),
            title: this.props.get('title'),
        });
    }
    onTitleClick_() {
        this.foldable.set('expanded', !this.foldable.get('expanded'));
    }
}

createPlugin({
    id: 'folder',
    type: 'blade',
    accept(params) {
        const result = parseRecord(params, (p) => ({
            title: p.required.string,
            view: p.required.constant('folder'),
            expanded: p.optional.boolean,
        }));
        return result ? { params: result } : null;
    },
    controller(args) {
        return new FolderController(args.document, {
            blade: args.blade,
            expanded: args.params.expanded,
            props: ValueMap.fromObject({
                title: args.params.title,
            }),
            viewProps: args.viewProps,
        });
    },
    api(args) {
        if (!(args.controller instanceof FolderController)) {
            return null;
        }
        return new FolderApi(args.controller, args.pool);
    },
});

const cn$p = ClassName('');
function valueToModifier(elem, modifier) {
    return valueToClassName(elem, cn$p(undefined, modifier));
}
class ViewProps extends ValueMap {
    constructor(valueMap) {
        var _a;
        super(valueMap);
        this.onDisabledChange_ = this.onDisabledChange_.bind(this);
        this.onParentChange_ = this.onParentChange_.bind(this);
        this.onParentGlobalDisabledChange_ =
            this.onParentGlobalDisabledChange_.bind(this);
        [this.globalDisabled_, this.setGlobalDisabled_] = createReadonlyValue(createValue(this.getGlobalDisabled_()));
        this.value('disabled').emitter.on('change', this.onDisabledChange_);
        this.value('parent').emitter.on('change', this.onParentChange_);
        (_a = this.get('parent')) === null || _a === void 0 ? void 0 : _a.globalDisabled.emitter.on('change', this.onParentGlobalDisabledChange_);
    }
    static create(opt_initialValue) {
        var _a, _b, _c;
        const initialValue = opt_initialValue !== null && opt_initialValue !== void 0 ? opt_initialValue : {};
        return new ViewProps(ValueMap.createCore({
            disabled: (_a = initialValue.disabled) !== null && _a !== void 0 ? _a : false,
            disposed: false,
            hidden: (_b = initialValue.hidden) !== null && _b !== void 0 ? _b : false,
            parent: (_c = initialValue.parent) !== null && _c !== void 0 ? _c : null,
        }));
    }
    get globalDisabled() {
        return this.globalDisabled_;
    }
    bindClassModifiers(elem) {
        bindValue(this.globalDisabled_, valueToModifier(elem, 'disabled'));
        bindValueMap(this, 'hidden', valueToModifier(elem, 'hidden'));
    }
    bindDisabled(target) {
        bindValue(this.globalDisabled_, (disabled) => {
            target.disabled = disabled;
        });
    }
    bindTabIndex(elem) {
        bindValue(this.globalDisabled_, (disabled) => {
            elem.tabIndex = disabled ? -1 : 0;
        });
    }
    handleDispose(callback) {
        this.value('disposed').emitter.on('change', (disposed) => {
            if (disposed) {
                callback();
            }
        });
    }
    importState(state) {
        this.set('disabled', state.disabled);
        this.set('hidden', state.hidden);
    }
    exportState() {
        return {
            disabled: this.get('disabled'),
            hidden: this.get('hidden'),
        };
    }
    getGlobalDisabled_() {
        const parent = this.get('parent');
        const parentDisabled = parent ? parent.globalDisabled.rawValue : false;
        return parentDisabled || this.get('disabled');
    }
    updateGlobalDisabled_() {
        this.setGlobalDisabled_(this.getGlobalDisabled_());
    }
    onDisabledChange_() {
        this.updateGlobalDisabled_();
    }
    onParentGlobalDisabledChange_() {
        this.updateGlobalDisabled_();
    }
    onParentChange_(ev) {
        var _a;
        const prevParent = ev.previousRawValue;
        prevParent === null || prevParent === void 0 ? void 0 : prevParent.globalDisabled.emitter.off('change', this.onParentGlobalDisabledChange_);
        (_a = this.get('parent')) === null || _a === void 0 ? void 0 : _a.globalDisabled.emitter.on('change', this.onParentGlobalDisabledChange_);
        this.updateGlobalDisabled_();
    }
}

const cn$o = ClassName('tbp');
class TabPageView {
    constructor(doc, config) {
        this.element = doc.createElement('div');
        this.element.classList.add(cn$o());
        config.viewProps.bindClassModifiers(this.element);
        const containerElem = doc.createElement('div');
        containerElem.classList.add(cn$o('c'));
        this.element.appendChild(containerElem);
        this.containerElement = containerElem;
    }
}

const cn$n = ClassName('tbi');
class TabItemView {
    constructor(doc, config) {
        this.element = doc.createElement('div');
        this.element.classList.add(cn$n());
        config.viewProps.bindClassModifiers(this.element);
        bindValueMap(config.props, 'selected', (selected) => {
            if (selected) {
                this.element.classList.add(cn$n(undefined, 'sel'));
            }
            else {
                this.element.classList.remove(cn$n(undefined, 'sel'));
            }
        });
        const buttonElem = doc.createElement('button');
        buttonElem.classList.add(cn$n('b'));
        config.viewProps.bindDisabled(buttonElem);
        this.element.appendChild(buttonElem);
        this.buttonElement = buttonElem;
        const titleElem = doc.createElement('div');
        titleElem.classList.add(cn$n('t'));
        bindValueToTextContent(config.props.value('title'), titleElem);
        this.buttonElement.appendChild(titleElem);
        this.titleElement = titleElem;
    }
}

class TabItemController {
    constructor(doc, config) {
        this.emitter = new Emitter();
        this.onClick_ = this.onClick_.bind(this);
        this.props = config.props;
        this.viewProps = config.viewProps;
        this.view = new TabItemView(doc, {
            props: config.props,
            viewProps: config.viewProps,
        });
        this.view.buttonElement.addEventListener('click', this.onClick_);
    }
    onClick_() {
        this.emitter.emit('click', {
            sender: this,
        });
    }
}

class TabPageController extends ContainerBladeController {
    constructor(doc, config) {
        const view = new TabPageView(doc, {
            viewProps: config.viewProps,
        });
        super(Object.assign(Object.assign({}, config), { rackController: new RackController({
                blade: config.blade,
                element: view.containerElement,
                viewProps: config.viewProps,
            }), view: view }));
        this.onItemClick_ = this.onItemClick_.bind(this);
        this.ic_ = new TabItemController(doc, {
            props: config.itemProps,
            viewProps: ViewProps.create(),
        });
        this.ic_.emitter.on('click', this.onItemClick_);
        this.props = config.props;
        bindValueMap(this.props, 'selected', (selected) => {
            this.itemController.props.set('selected', selected);
            this.viewProps.set('hidden', !selected);
        });
    }
    get itemController() {
        return this.ic_;
    }
    importState(state) {
        return importBladeState(state, (s) => super.importState(s), (p) => ({
            selected: p.required.boolean,
            title: p.required.string,
        }), (result) => {
            this.ic_.props.set('selected', result.selected);
            this.ic_.props.set('title', result.title);
            return true;
        });
    }
    exportState() {
        return exportBladeState(() => super.exportState(), {
            selected: this.ic_.props.get('selected'),
            title: this.ic_.props.get('title'),
        });
    }
    onItemClick_() {
        this.props.set('selected', true);
    }
}

class TabApi extends ContainerBladeApi {
    constructor(controller, pool) {
        super(controller, pool);
        this.emitter_ = new Emitter();
        this.onSelect_ = this.onSelect_.bind(this);
        this.pool_ = pool;
        this.rackApi_.on('change', (ev) => {
            this.emitter_.emit('change', ev);
        });
        this.controller.tab.selectedIndex.emitter.on('change', this.onSelect_);
    }
    get pages() {
        return this.rackApi_.children;
    }
    addPage(params) {
        const doc = this.controller.view.element.ownerDocument;
        const pc = new TabPageController(doc, {
            blade: createBlade(),
            itemProps: ValueMap.fromObject({
                selected: false,
                title: params.title,
            }),
            props: ValueMap.fromObject({
                selected: false,
            }),
            viewProps: ViewProps.create(),
        });
        const papi = this.pool_.createApi(pc);
        return this.rackApi_.add(papi, params.index);
    }
    removePage(index) {
        this.rackApi_.remove(this.rackApi_.children[index]);
    }
    on(eventName, handler) {
        const bh = handler.bind(this);
        this.emitter_.on(eventName, (ev) => {
            bh(ev);
        }, {
            key: handler,
        });
        return this;
    }
    off(eventName, handler) {
        this.emitter_.off(eventName, handler);
        return this;
    }
    onSelect_(ev) {
        this.emitter_.emit('select', new TpTabSelectEvent(this, ev.rawValue));
    }
}

class TabPageApi extends ContainerBladeApi {
    get title() {
        var _a;
        return (_a = this.controller.itemController.props.get('title')) !== null && _a !== void 0 ? _a : '';
    }
    set title(title) {
        this.controller.itemController.props.set('title', title);
    }
    get selected() {
        return this.controller.props.get('selected');
    }
    set selected(selected) {
        this.controller.props.set('selected', selected);
    }
    get children() {
        return this.rackApi_.children;
    }
    addButton(params) {
        return this.rackApi_.addButton(params);
    }
    addFolder(params) {
        return this.rackApi_.addFolder(params);
    }
    addTab(params) {
        return this.rackApi_.addTab(params);
    }
    add(api, opt_index) {
        this.rackApi_.add(api, opt_index);
    }
    remove(api) {
        this.rackApi_.remove(api);
    }
    addBinding(object, key, opt_params) {
        return this.rackApi_.addBinding(object, key, opt_params);
    }
    addBlade(params) {
        return this.rackApi_.addBlade(params);
    }
}

const INDEX_NOT_SELECTED = -1;
class Tab {
    constructor() {
        this.onItemSelectedChange_ = this.onItemSelectedChange_.bind(this);
        this.empty = createValue(true);
        this.selectedIndex = createValue(INDEX_NOT_SELECTED);
        this.items_ = [];
    }
    add(item, opt_index) {
        const index = opt_index !== null && opt_index !== void 0 ? opt_index : this.items_.length;
        this.items_.splice(index, 0, item);
        item.emitter.on('change', this.onItemSelectedChange_);
        this.keepSelection_();
    }
    remove(item) {
        const index = this.items_.indexOf(item);
        if (index < 0) {
            return;
        }
        this.items_.splice(index, 1);
        item.emitter.off('change', this.onItemSelectedChange_);
        this.keepSelection_();
    }
    keepSelection_() {
        if (this.items_.length === 0) {
            this.selectedIndex.rawValue = INDEX_NOT_SELECTED;
            this.empty.rawValue = true;
            return;
        }
        const firstSelIndex = this.items_.findIndex((s) => s.rawValue);
        if (firstSelIndex < 0) {
            this.items_.forEach((s, i) => {
                s.rawValue = i === 0;
            });
            this.selectedIndex.rawValue = 0;
        }
        else {
            this.items_.forEach((s, i) => {
                s.rawValue = i === firstSelIndex;
            });
            this.selectedIndex.rawValue = firstSelIndex;
        }
        this.empty.rawValue = false;
    }
    onItemSelectedChange_(ev) {
        if (ev.rawValue) {
            const index = this.items_.findIndex((s) => s === ev.sender);
            this.items_.forEach((s, i) => {
                s.rawValue = i === index;
            });
            this.selectedIndex.rawValue = index;
        }
        else {
            this.keepSelection_();
        }
    }
}

const cn$m = ClassName('tab');
class TabView {
    constructor(doc, config) {
        this.element = doc.createElement('div');
        this.element.classList.add(cn$m(), bladeContainerClassName());
        config.viewProps.bindClassModifiers(this.element);
        bindValue(config.empty, valueToClassName(this.element, cn$m(undefined, 'nop')));
        const titleElem = doc.createElement('div');
        titleElem.classList.add(cn$m('t'));
        this.element.appendChild(titleElem);
        this.itemsElement = titleElem;
        const indentElem = doc.createElement('div');
        indentElem.classList.add(cn$m('i'));
        this.element.appendChild(indentElem);
        const contentsElem = doc.createElement('div');
        contentsElem.classList.add(cn$m('c'));
        this.element.appendChild(contentsElem);
        this.contentsElement = contentsElem;
    }
}

class TabController extends ContainerBladeController {
    constructor(doc, config) {
        const tab = new Tab();
        const view = new TabView(doc, {
            empty: tab.empty,
            viewProps: config.viewProps,
        });
        super({
            blade: config.blade,
            rackController: new RackController({
                blade: config.blade,
                element: view.contentsElement,
                viewProps: config.viewProps,
            }),
            view: view,
        });
        this.onRackAdd_ = this.onRackAdd_.bind(this);
        this.onRackRemove_ = this.onRackRemove_.bind(this);
        const rack = this.rackController.rack;
        rack.emitter.on('add', this.onRackAdd_);
        rack.emitter.on('remove', this.onRackRemove_);
        this.tab = tab;
    }
    add(pc, opt_index) {
        this.rackController.rack.add(pc, opt_index);
    }
    remove(index) {
        this.rackController.rack.remove(this.rackController.rack.children[index]);
    }
    onRackAdd_(ev) {
        if (!ev.root) {
            return;
        }
        const pc = ev.bladeController;
        insertElementAt(this.view.itemsElement, pc.itemController.view.element, ev.index);
        pc.itemController.viewProps.set('parent', this.viewProps);
        this.tab.add(pc.props.value('selected'));
    }
    onRackRemove_(ev) {
        if (!ev.root) {
            return;
        }
        const pc = ev.bladeController;
        removeElement(pc.itemController.view.element);
        pc.itemController.viewProps.set('parent', null);
        this.tab.remove(pc.props.value('selected'));
    }
}

createPlugin({
    id: 'tab',
    type: 'blade',
    accept(params) {
        const result = parseRecord(params, (p) => ({
            pages: p.required.array(p.required.object({ title: p.required.string })),
            view: p.required.constant('tab'),
        }));
        if (!result || result.pages.length === 0) {
            return null;
        }
        return { params: result };
    },
    controller(args) {
        const c = new TabController(args.document, {
            blade: args.blade,
            viewProps: args.viewProps,
        });
        args.params.pages.forEach((p) => {
            const pc = new TabPageController(args.document, {
                blade: createBlade(),
                itemProps: ValueMap.fromObject({
                    selected: false,
                    title: p.title,
                }),
                props: ValueMap.fromObject({
                    selected: false,
                }),
                viewProps: ViewProps.create(),
            });
            c.add(pc);
        });
        return c;
    },
    api(args) {
        if (args.controller instanceof TabController) {
            return new TabApi(args.controller, args.pool);
        }
        if (args.controller instanceof TabPageController) {
            return new TabPageApi(args.controller, args.pool);
        }
        return null;
    },
});

class ListInputBindingApi extends BindingApi {
    get options() {
        return this.controller.valueController.props.get('options');
    }
    set options(options) {
        this.controller.valueController.props.set('options', options);
    }
}

class CompositeConstraint {
    constructor(constraints) {
        this.constraints = constraints;
    }
    constrain(value) {
        return this.constraints.reduce((result, c) => {
            return c.constrain(result);
        }, value);
    }
}
function findConstraint(c, constraintClass) {
    if (c instanceof constraintClass) {
        return c;
    }
    if (c instanceof CompositeConstraint) {
        const result = c.constraints.reduce((tmpResult, sc) => {
            if (tmpResult) {
                return tmpResult;
            }
            return sc instanceof constraintClass ? sc : null;
        }, null);
        if (result) {
            return result;
        }
    }
    return null;
}

class ListConstraint {
    constructor(options) {
        this.values = ValueMap.fromObject({
            options: options,
        });
    }
    constrain(value) {
        const opts = this.values.get('options');
        if (opts.length === 0) {
            return value;
        }
        const matched = opts.filter((item) => {
            return item.value === value;
        }).length > 0;
        return matched ? value : opts[0].value;
    }
}

function parseListOptions(value) {
    var _a;
    const p = MicroParsers;
    if (Array.isArray(value)) {
        return (_a = parseRecord({ items: value }, (p) => ({
            items: p.required.array(p.required.object({
                text: p.required.string,
                value: p.required.raw,
            })),
        }))) === null || _a === void 0 ? void 0 : _a.items;
    }
    if (typeof value === 'object') {
        return p.required.raw(value)
            .value;
    }
    return undefined;
}
function normalizeListOptions(options) {
    if (Array.isArray(options)) {
        return options;
    }
    const items = [];
    Object.keys(options).forEach((text) => {
        items.push({ text: text, value: options[text] });
    });
    return items;
}
function createListConstraint(options) {
    return !isEmpty(options)
        ? new ListConstraint(normalizeListOptions(forceCast(options)))
        : null;
}

const cn$l = ClassName('lst');
class ListView {
    constructor(doc, config) {
        this.onValueChange_ = this.onValueChange_.bind(this);
        this.props_ = config.props;
        this.element = doc.createElement('div');
        this.element.classList.add(cn$l());
        config.viewProps.bindClassModifiers(this.element);
        const selectElem = doc.createElement('select');
        selectElem.classList.add(cn$l('s'));
        config.viewProps.bindDisabled(selectElem);
        this.element.appendChild(selectElem);
        this.selectElement = selectElem;
        const markElem = doc.createElement('div');
        markElem.classList.add(cn$l('m'));
        markElem.appendChild(createSvgIconElement(doc, 'dropdown'));
        this.element.appendChild(markElem);
        config.value.emitter.on('change', this.onValueChange_);
        this.value_ = config.value;
        bindValueMap(this.props_, 'options', (opts) => {
            removeChildElements(this.selectElement);
            opts.forEach((item) => {
                const optionElem = doc.createElement('option');
                optionElem.textContent = item.text;
                this.selectElement.appendChild(optionElem);
            });
            this.update_();
        });
    }
    update_() {
        const values = this.props_.get('options').map((o) => o.value);
        this.selectElement.selectedIndex = values.indexOf(this.value_.rawValue);
    }
    onValueChange_() {
        this.update_();
    }
}

class ListController {
    constructor(doc, config) {
        this.onSelectChange_ = this.onSelectChange_.bind(this);
        this.props = config.props;
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.view = new ListView(doc, {
            props: this.props,
            value: this.value,
            viewProps: this.viewProps,
        });
        this.view.selectElement.addEventListener('change', this.onSelectChange_);
    }
    onSelectChange_(e) {
        const selectElem = forceCast(e.currentTarget);
        this.value.rawValue =
            this.props.get('options')[selectElem.selectedIndex].value;
    }
    importProps(state) {
        return importBladeState(state, null, (p) => ({
            options: p.required.custom(parseListOptions),
        }), (result) => {
            this.props.set('options', normalizeListOptions(result.options));
            return true;
        });
    }
    exportProps() {
        return exportBladeState(null, {
            options: this.props.get('options'),
        });
    }
}

const cn$k = ClassName('pop');
class PopupView {
    constructor(doc, config) {
        this.element = doc.createElement('div');
        this.element.classList.add(cn$k());
        config.viewProps.bindClassModifiers(this.element);
        bindValue(config.shows, valueToClassName(this.element, cn$k(undefined, 'v')));
    }
}

class PopupController {
    constructor(doc, config) {
        this.shows = createValue(false);
        this.viewProps = config.viewProps;
        this.view = new PopupView(doc, {
            shows: this.shows,
            viewProps: this.viewProps,
        });
    }
}

const cn$j = ClassName('txt');
class TextView {
    constructor(doc, config) {
        this.onChange_ = this.onChange_.bind(this);
        this.element = doc.createElement('div');
        this.element.classList.add(cn$j());
        config.viewProps.bindClassModifiers(this.element);
        this.props_ = config.props;
        this.props_.emitter.on('change', this.onChange_);
        const inputElem = doc.createElement('input');
        inputElem.classList.add(cn$j('i'));
        inputElem.type = 'text';
        config.viewProps.bindDisabled(inputElem);
        this.element.appendChild(inputElem);
        this.inputElement = inputElem;
        config.value.emitter.on('change', this.onChange_);
        this.value_ = config.value;
        this.refresh();
    }
    refresh() {
        const formatter = this.props_.get('formatter');
        this.inputElement.value = formatter(this.value_.rawValue);
    }
    onChange_() {
        this.refresh();
    }
}

class TextController {
    constructor(doc, config) {
        this.onInputChange_ = this.onInputChange_.bind(this);
        this.parser_ = config.parser;
        this.props = config.props;
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.view = new TextView(doc, {
            props: config.props,
            value: this.value,
            viewProps: this.viewProps,
        });
        this.view.inputElement.addEventListener('change', this.onInputChange_);
    }
    onInputChange_(e) {
        const inputElem = forceCast(e.currentTarget);
        const value = inputElem.value;
        const parsedValue = this.parser_(value);
        if (!isEmpty(parsedValue)) {
            this.value.rawValue = parsedValue;
        }
        this.view.refresh();
    }
}

function boolToString(value) {
    return String(value);
}
function boolFromUnknown(value) {
    if (value === 'false') {
        return false;
    }
    return !!value;
}
function BooleanFormatter(value) {
    return boolToString(value);
}

function composeParsers(parsers) {
    return (text) => {
        return parsers.reduce((result, parser) => {
            if (result !== null) {
                return result;
            }
            return parser(text);
        }, null);
    };
}

const innerFormatter = createNumberFormatter(0);
function formatPercentage(value) {
    return innerFormatter(value) + '%';
}

function stringFromUnknown(value) {
    return String(value);
}
function formatString(value) {
    return value;
}

function connectValues({ primary, secondary, forward, backward, }) {
    let changing = false;
    function preventFeedback(callback) {
        if (changing) {
            return;
        }
        changing = true;
        callback();
        changing = false;
    }
    primary.emitter.on('change', (ev) => {
        preventFeedback(() => {
            secondary.setRawValue(forward(primary.rawValue, secondary.rawValue), ev.options);
        });
    });
    secondary.emitter.on('change', (ev) => {
        preventFeedback(() => {
            primary.setRawValue(backward(primary.rawValue, secondary.rawValue), ev.options);
        });
        preventFeedback(() => {
            secondary.setRawValue(forward(primary.rawValue, secondary.rawValue), ev.options);
        });
    });
    preventFeedback(() => {
        secondary.setRawValue(forward(primary.rawValue, secondary.rawValue), {
            forceEmit: false,
            last: true,
        });
    });
}

function getStepForKey(keyScale, keys) {
    const step = keyScale * (keys.altKey ? 0.1 : 1) * (keys.shiftKey ? 10 : 1);
    if (keys.upKey) {
        return +step;
    }
    else if (keys.downKey) {
        return -step;
    }
    return 0;
}
function getVerticalStepKeys(ev) {
    return {
        altKey: ev.altKey,
        downKey: ev.key === 'ArrowDown',
        shiftKey: ev.shiftKey,
        upKey: ev.key === 'ArrowUp',
    };
}
function getHorizontalStepKeys(ev) {
    return {
        altKey: ev.altKey,
        downKey: ev.key === 'ArrowLeft',
        shiftKey: ev.shiftKey,
        upKey: ev.key === 'ArrowRight',
    };
}
function isVerticalArrowKey(key) {
    return key === 'ArrowUp' || key === 'ArrowDown';
}
function isArrowKey(key) {
    return isVerticalArrowKey(key) || key === 'ArrowLeft' || key === 'ArrowRight';
}

function computeOffset$1(ev, elem) {
    var _a, _b;
    const win = elem.ownerDocument.defaultView;
    const rect = elem.getBoundingClientRect();
    return {
        x: ev.pageX - (((_a = (win && win.scrollX)) !== null && _a !== void 0 ? _a : 0) + rect.left),
        y: ev.pageY - (((_b = (win && win.scrollY)) !== null && _b !== void 0 ? _b : 0) + rect.top),
    };
}
class PointerHandler {
    constructor(element) {
        this.lastTouch_ = null;
        this.onDocumentMouseMove_ = this.onDocumentMouseMove_.bind(this);
        this.onDocumentMouseUp_ = this.onDocumentMouseUp_.bind(this);
        this.onMouseDown_ = this.onMouseDown_.bind(this);
        this.onTouchEnd_ = this.onTouchEnd_.bind(this);
        this.onTouchMove_ = this.onTouchMove_.bind(this);
        this.onTouchStart_ = this.onTouchStart_.bind(this);
        this.elem_ = element;
        this.emitter = new Emitter();
        element.addEventListener('touchstart', this.onTouchStart_, {
            passive: false,
        });
        element.addEventListener('touchmove', this.onTouchMove_, {
            passive: true,
        });
        element.addEventListener('touchend', this.onTouchEnd_);
        element.addEventListener('mousedown', this.onMouseDown_);
    }
    computePosition_(offset) {
        const rect = this.elem_.getBoundingClientRect();
        return {
            bounds: {
                width: rect.width,
                height: rect.height,
            },
            point: offset
                ? {
                    x: offset.x,
                    y: offset.y,
                }
                : null,
        };
    }
    onMouseDown_(ev) {
        var _a;
        ev.preventDefault();
        (_a = ev.currentTarget) === null || _a === void 0 ? void 0 : _a.focus();
        const doc = this.elem_.ownerDocument;
        doc.addEventListener('mousemove', this.onDocumentMouseMove_);
        doc.addEventListener('mouseup', this.onDocumentMouseUp_);
        this.emitter.emit('down', {
            altKey: ev.altKey,
            data: this.computePosition_(computeOffset$1(ev, this.elem_)),
            sender: this,
            shiftKey: ev.shiftKey,
        });
    }
    onDocumentMouseMove_(ev) {
        this.emitter.emit('move', {
            altKey: ev.altKey,
            data: this.computePosition_(computeOffset$1(ev, this.elem_)),
            sender: this,
            shiftKey: ev.shiftKey,
        });
    }
    onDocumentMouseUp_(ev) {
        const doc = this.elem_.ownerDocument;
        doc.removeEventListener('mousemove', this.onDocumentMouseMove_);
        doc.removeEventListener('mouseup', this.onDocumentMouseUp_);
        this.emitter.emit('up', {
            altKey: ev.altKey,
            data: this.computePosition_(computeOffset$1(ev, this.elem_)),
            sender: this,
            shiftKey: ev.shiftKey,
        });
    }
    onTouchStart_(ev) {
        ev.preventDefault();
        const touch = ev.targetTouches.item(0);
        const rect = this.elem_.getBoundingClientRect();
        this.emitter.emit('down', {
            altKey: ev.altKey,
            data: this.computePosition_(touch
                ? {
                    x: touch.clientX - rect.left,
                    y: touch.clientY - rect.top,
                }
                : undefined),
            sender: this,
            shiftKey: ev.shiftKey,
        });
        this.lastTouch_ = touch;
    }
    onTouchMove_(ev) {
        const touch = ev.targetTouches.item(0);
        const rect = this.elem_.getBoundingClientRect();
        this.emitter.emit('move', {
            altKey: ev.altKey,
            data: this.computePosition_(touch
                ? {
                    x: touch.clientX - rect.left,
                    y: touch.clientY - rect.top,
                }
                : undefined),
            sender: this,
            shiftKey: ev.shiftKey,
        });
        this.lastTouch_ = touch;
    }
    onTouchEnd_(ev) {
        var _a;
        const touch = (_a = ev.targetTouches.item(0)) !== null && _a !== void 0 ? _a : this.lastTouch_;
        const rect = this.elem_.getBoundingClientRect();
        this.emitter.emit('up', {
            altKey: ev.altKey,
            data: this.computePosition_(touch
                ? {
                    x: touch.clientX - rect.left,
                    y: touch.clientY - rect.top,
                }
                : undefined),
            sender: this,
            shiftKey: ev.shiftKey,
        });
    }
}

const cn$i = ClassName('txt');
class NumberTextView {
    constructor(doc, config) {
        this.onChange_ = this.onChange_.bind(this);
        this.props_ = config.props;
        this.props_.emitter.on('change', this.onChange_);
        this.element = doc.createElement('div');
        this.element.classList.add(cn$i(), cn$i(undefined, 'num'));
        if (config.arrayPosition) {
            this.element.classList.add(cn$i(undefined, config.arrayPosition));
        }
        config.viewProps.bindClassModifiers(this.element);
        const inputElem = doc.createElement('input');
        inputElem.classList.add(cn$i('i'));
        inputElem.type = 'text';
        config.viewProps.bindDisabled(inputElem);
        this.element.appendChild(inputElem);
        this.inputElement = inputElem;
        this.onDraggingChange_ = this.onDraggingChange_.bind(this);
        this.dragging_ = config.dragging;
        this.dragging_.emitter.on('change', this.onDraggingChange_);
        this.element.classList.add(cn$i());
        this.inputElement.classList.add(cn$i('i'));
        const knobElem = doc.createElement('div');
        knobElem.classList.add(cn$i('k'));
        this.element.appendChild(knobElem);
        this.knobElement = knobElem;
        const guideElem = doc.createElementNS(SVG_NS, 'svg');
        guideElem.classList.add(cn$i('g'));
        this.knobElement.appendChild(guideElem);
        const bodyElem = doc.createElementNS(SVG_NS, 'path');
        bodyElem.classList.add(cn$i('gb'));
        guideElem.appendChild(bodyElem);
        this.guideBodyElem_ = bodyElem;
        const headElem = doc.createElementNS(SVG_NS, 'path');
        headElem.classList.add(cn$i('gh'));
        guideElem.appendChild(headElem);
        this.guideHeadElem_ = headElem;
        const tooltipElem = doc.createElement('div');
        tooltipElem.classList.add(ClassName('tt')());
        this.knobElement.appendChild(tooltipElem);
        this.tooltipElem_ = tooltipElem;
        config.value.emitter.on('change', this.onChange_);
        this.value = config.value;
        this.refresh();
    }
    onDraggingChange_(ev) {
        if (ev.rawValue === null) {
            this.element.classList.remove(cn$i(undefined, 'drg'));
            return;
        }
        this.element.classList.add(cn$i(undefined, 'drg'));
        const x = ev.rawValue / this.props_.get('pointerScale');
        const aox = x + (x > 0 ? -1 : x < 0 ? +1 : 0);
        const adx = constrainRange(-aox, -4, +4);
        this.guideHeadElem_.setAttributeNS(null, 'd', [`M ${aox + adx},0 L${aox},4 L${aox + adx},8`, `M ${x},-1 L${x},9`].join(' '));
        this.guideBodyElem_.setAttributeNS(null, 'd', `M 0,4 L${x},4`);
        const formatter = this.props_.get('formatter');
        this.tooltipElem_.textContent = formatter(this.value.rawValue);
        this.tooltipElem_.style.left = `${x}px`;
    }
    refresh() {
        const formatter = this.props_.get('formatter');
        this.inputElement.value = formatter(this.value.rawValue);
    }
    onChange_() {
        this.refresh();
    }
}

class NumberTextController {
    constructor(doc, config) {
        var _a;
        this.originRawValue_ = 0;
        this.onInputChange_ = this.onInputChange_.bind(this);
        this.onInputKeyDown_ = this.onInputKeyDown_.bind(this);
        this.onInputKeyUp_ = this.onInputKeyUp_.bind(this);
        this.onPointerDown_ = this.onPointerDown_.bind(this);
        this.onPointerMove_ = this.onPointerMove_.bind(this);
        this.onPointerUp_ = this.onPointerUp_.bind(this);
        this.parser_ = config.parser;
        this.props = config.props;
        this.sliderProps_ = (_a = config.sliderProps) !== null && _a !== void 0 ? _a : null;
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.dragging_ = createValue(null);
        this.view = new NumberTextView(doc, {
            arrayPosition: config.arrayPosition,
            dragging: this.dragging_,
            props: this.props,
            value: this.value,
            viewProps: this.viewProps,
        });
        this.view.inputElement.addEventListener('change', this.onInputChange_);
        this.view.inputElement.addEventListener('keydown', this.onInputKeyDown_);
        this.view.inputElement.addEventListener('keyup', this.onInputKeyUp_);
        const ph = new PointerHandler(this.view.knobElement);
        ph.emitter.on('down', this.onPointerDown_);
        ph.emitter.on('move', this.onPointerMove_);
        ph.emitter.on('up', this.onPointerUp_);
    }
    constrainValue_(value) {
        var _a, _b;
        const min = (_a = this.sliderProps_) === null || _a === void 0 ? void 0 : _a.get('min');
        const max = (_b = this.sliderProps_) === null || _b === void 0 ? void 0 : _b.get('max');
        let v = value;
        if (min !== undefined) {
            v = Math.max(v, min);
        }
        if (max !== undefined) {
            v = Math.min(v, max);
        }
        return v;
    }
    onInputChange_(e) {
        const inputElem = forceCast(e.currentTarget);
        const value = inputElem.value;
        const parsedValue = this.parser_(value);
        if (!isEmpty(parsedValue)) {
            this.value.rawValue = this.constrainValue_(parsedValue);
        }
        this.view.refresh();
    }
    onInputKeyDown_(ev) {
        const step = getStepForKey(this.props.get('keyScale'), getVerticalStepKeys(ev));
        if (step === 0) {
            return;
        }
        this.value.setRawValue(this.constrainValue_(this.value.rawValue + step), {
            forceEmit: false,
            last: false,
        });
    }
    onInputKeyUp_(ev) {
        const step = getStepForKey(this.props.get('keyScale'), getVerticalStepKeys(ev));
        if (step === 0) {
            return;
        }
        this.value.setRawValue(this.value.rawValue, {
            forceEmit: true,
            last: true,
        });
    }
    onPointerDown_() {
        this.originRawValue_ = this.value.rawValue;
        this.dragging_.rawValue = 0;
    }
    computeDraggingValue_(data) {
        if (!data.point) {
            return null;
        }
        const dx = data.point.x - data.bounds.width / 2;
        return this.constrainValue_(this.originRawValue_ + dx * this.props.get('pointerScale'));
    }
    onPointerMove_(ev) {
        const v = this.computeDraggingValue_(ev.data);
        if (v === null) {
            return;
        }
        this.value.setRawValue(v, {
            forceEmit: false,
            last: false,
        });
        this.dragging_.rawValue = this.value.rawValue - this.originRawValue_;
    }
    onPointerUp_(ev) {
        const v = this.computeDraggingValue_(ev.data);
        if (v === null) {
            return;
        }
        this.value.setRawValue(v, {
            forceEmit: true,
            last: true,
        });
        this.dragging_.rawValue = null;
    }
}

const cn$h = ClassName('sld');
class SliderView {
    constructor(doc, config) {
        this.onChange_ = this.onChange_.bind(this);
        this.props_ = config.props;
        this.props_.emitter.on('change', this.onChange_);
        this.element = doc.createElement('div');
        this.element.classList.add(cn$h());
        config.viewProps.bindClassModifiers(this.element);
        const trackElem = doc.createElement('div');
        trackElem.classList.add(cn$h('t'));
        config.viewProps.bindTabIndex(trackElem);
        this.element.appendChild(trackElem);
        this.trackElement = trackElem;
        const knobElem = doc.createElement('div');
        knobElem.classList.add(cn$h('k'));
        this.trackElement.appendChild(knobElem);
        this.knobElement = knobElem;
        config.value.emitter.on('change', this.onChange_);
        this.value = config.value;
        this.update_();
    }
    update_() {
        const p = constrainRange(mapRange(this.value.rawValue, this.props_.get('min'), this.props_.get('max'), 0, 100), 0, 100);
        this.knobElement.style.width = `${p}%`;
    }
    onChange_() {
        this.update_();
    }
}

class SliderController {
    constructor(doc, config) {
        this.onKeyDown_ = this.onKeyDown_.bind(this);
        this.onKeyUp_ = this.onKeyUp_.bind(this);
        this.onPointerDownOrMove_ = this.onPointerDownOrMove_.bind(this);
        this.onPointerUp_ = this.onPointerUp_.bind(this);
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.props = config.props;
        this.view = new SliderView(doc, {
            props: this.props,
            value: this.value,
            viewProps: this.viewProps,
        });
        this.ptHandler_ = new PointerHandler(this.view.trackElement);
        this.ptHandler_.emitter.on('down', this.onPointerDownOrMove_);
        this.ptHandler_.emitter.on('move', this.onPointerDownOrMove_);
        this.ptHandler_.emitter.on('up', this.onPointerUp_);
        this.view.trackElement.addEventListener('keydown', this.onKeyDown_);
        this.view.trackElement.addEventListener('keyup', this.onKeyUp_);
    }
    handlePointerEvent_(d, opts) {
        if (!d.point) {
            return;
        }
        this.value.setRawValue(mapRange(constrainRange(d.point.x, 0, d.bounds.width), 0, d.bounds.width, this.props.get('min'), this.props.get('max')), opts);
    }
    onPointerDownOrMove_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: false,
            last: false,
        });
    }
    onPointerUp_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: true,
            last: true,
        });
    }
    onKeyDown_(ev) {
        const step = getStepForKey(this.props.get('keyScale'), getHorizontalStepKeys(ev));
        if (step === 0) {
            return;
        }
        this.value.setRawValue(this.value.rawValue + step, {
            forceEmit: false,
            last: false,
        });
    }
    onKeyUp_(ev) {
        const step = getStepForKey(this.props.get('keyScale'), getHorizontalStepKeys(ev));
        if (step === 0) {
            return;
        }
        this.value.setRawValue(this.value.rawValue, {
            forceEmit: true,
            last: true,
        });
    }
}

const cn$g = ClassName('sldtxt');
class SliderTextView {
    constructor(doc, config) {
        this.element = doc.createElement('div');
        this.element.classList.add(cn$g());
        const sliderElem = doc.createElement('div');
        sliderElem.classList.add(cn$g('s'));
        this.sliderView_ = config.sliderView;
        sliderElem.appendChild(this.sliderView_.element);
        this.element.appendChild(sliderElem);
        const textElem = doc.createElement('div');
        textElem.classList.add(cn$g('t'));
        this.textView_ = config.textView;
        textElem.appendChild(this.textView_.element);
        this.element.appendChild(textElem);
    }
}

class SliderTextController {
    constructor(doc, config) {
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.sliderC_ = new SliderController(doc, {
            props: config.sliderProps,
            value: config.value,
            viewProps: this.viewProps,
        });
        this.textC_ = new NumberTextController(doc, {
            parser: config.parser,
            props: config.textProps,
            sliderProps: config.sliderProps,
            value: config.value,
            viewProps: config.viewProps,
        });
        this.view = new SliderTextView(doc, {
            sliderView: this.sliderC_.view,
            textView: this.textC_.view,
        });
    }
    get sliderController() {
        return this.sliderC_;
    }
    get textController() {
        return this.textC_;
    }
    importProps(state) {
        return importBladeState(state, null, (p) => ({
            max: p.required.number,
            min: p.required.number,
        }), (result) => {
            const sliderProps = this.sliderC_.props;
            sliderProps.set('max', result.max);
            sliderProps.set('min', result.min);
            return true;
        });
    }
    exportProps() {
        const sliderProps = this.sliderC_.props;
        return exportBladeState(null, {
            max: sliderProps.get('max'),
            min: sliderProps.get('min'),
        });
    }
}
function createSliderTextProps(config) {
    return {
        sliderProps: new ValueMap({
            keyScale: config.keyScale,
            max: config.max,
            min: config.min,
        }),
        textProps: new ValueMap({
            formatter: createValue(config.formatter),
            keyScale: config.keyScale,
            pointerScale: createValue(config.pointerScale),
        }),
    };
}

const CSS_VAR_MAP = {
    containerUnitSize: 'cnt-usz',
};
function getCssVar(key) {
    return `--${CSS_VAR_MAP[key]}`;
}

function createPointDimensionParser(p) {
    return createNumberTextInputParamsParser(p);
}
function parsePointDimensionParams(value) {
    if (!isRecord(value)) {
        return undefined;
    }
    return parseRecord(value, createPointDimensionParser);
}
function createDimensionConstraint(params, initialValue) {
    if (!params) {
        return undefined;
    }
    const constraints = [];
    const cs = createStepConstraint(params, initialValue);
    if (cs) {
        constraints.push(cs);
    }
    const rs = createRangeConstraint(params);
    if (rs) {
        constraints.push(rs);
    }
    return new CompositeConstraint(constraints);
}

function parsePickerLayout(value) {
    if (value === 'inline' || value === 'popup') {
        return value;
    }
    return undefined;
}

function writePrimitive(target, value) {
    target.write(value);
}

const cn$f = ClassName('ckb');
class CheckboxView {
    constructor(doc, config) {
        this.onValueChange_ = this.onValueChange_.bind(this);
        this.element = doc.createElement('div');
        this.element.classList.add(cn$f());
        config.viewProps.bindClassModifiers(this.element);
        const labelElem = doc.createElement('label');
        labelElem.classList.add(cn$f('l'));
        this.element.appendChild(labelElem);
        this.labelElement = labelElem;
        const inputElem = doc.createElement('input');
        inputElem.classList.add(cn$f('i'));
        inputElem.type = 'checkbox';
        this.labelElement.appendChild(inputElem);
        this.inputElement = inputElem;
        config.viewProps.bindDisabled(this.inputElement);
        const wrapperElem = doc.createElement('div');
        wrapperElem.classList.add(cn$f('w'));
        this.labelElement.appendChild(wrapperElem);
        const markElem = createSvgIconElement(doc, 'check');
        wrapperElem.appendChild(markElem);
        config.value.emitter.on('change', this.onValueChange_);
        this.value = config.value;
        this.update_();
    }
    update_() {
        this.inputElement.checked = this.value.rawValue;
    }
    onValueChange_() {
        this.update_();
    }
}

class CheckboxController {
    constructor(doc, config) {
        this.onInputChange_ = this.onInputChange_.bind(this);
        this.onLabelMouseDown_ = this.onLabelMouseDown_.bind(this);
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.view = new CheckboxView(doc, {
            value: this.value,
            viewProps: this.viewProps,
        });
        this.view.inputElement.addEventListener('change', this.onInputChange_);
        this.view.labelElement.addEventListener('mousedown', this.onLabelMouseDown_);
    }
    onInputChange_(ev) {
        const inputElem = forceCast(ev.currentTarget);
        this.value.rawValue = inputElem.checked;
        ev.preventDefault();
        ev.stopPropagation();
    }
    onLabelMouseDown_(ev) {
        ev.preventDefault();
    }
}

function createConstraint$6(params) {
    const constraints = [];
    const lc = createListConstraint(params.options);
    if (lc) {
        constraints.push(lc);
    }
    return new CompositeConstraint(constraints);
}
createPlugin({
    id: 'input-bool',
    type: 'input',
    accept: (value, params) => {
        if (typeof value !== 'boolean') {
            return null;
        }
        const result = parseRecord(params, (p) => ({
            options: p.optional.custom(parseListOptions),
            readonly: p.optional.constant(false),
        }));
        return result
            ? {
                initialValue: value,
                params: result,
            }
            : null;
    },
    binding: {
        reader: (_args) => boolFromUnknown,
        constraint: (args) => createConstraint$6(args.params),
        writer: (_args) => writePrimitive,
    },
    controller: (args) => {
        const doc = args.document;
        const value = args.value;
        const c = args.constraint;
        const lc = c && findConstraint(c, ListConstraint);
        if (lc) {
            return new ListController(doc, {
                props: new ValueMap({
                    options: lc.values.value('options'),
                }),
                value: value,
                viewProps: args.viewProps,
            });
        }
        return new CheckboxController(doc, {
            value: value,
            viewProps: args.viewProps,
        });
    },
    api(args) {
        if (typeof args.controller.value.rawValue !== 'boolean') {
            return null;
        }
        if (args.controller.valueController instanceof ListController) {
            return new ListInputBindingApi(args.controller);
        }
        return null;
    },
});

const cn$e = ClassName('col');
class ColorView$1 {
    constructor(doc, config) {
        this.element = doc.createElement('div');
        this.element.classList.add(cn$e());
        config.foldable.bindExpandedClass(this.element, cn$e(undefined, 'expanded'));
        bindValueMap(config.foldable, 'completed', valueToClassName(this.element, cn$e(undefined, 'cpl')));
        const headElem = doc.createElement('div');
        headElem.classList.add(cn$e('h'));
        this.element.appendChild(headElem);
        const swatchElem = doc.createElement('div');
        swatchElem.classList.add(cn$e('s'));
        headElem.appendChild(swatchElem);
        this.swatchElement = swatchElem;
        const textElem = doc.createElement('div');
        textElem.classList.add(cn$e('t'));
        headElem.appendChild(textElem);
        this.textElement = textElem;
        if (config.pickerLayout === 'inline') {
            const pickerElem = doc.createElement('div');
            pickerElem.classList.add(cn$e('p'));
            this.element.appendChild(pickerElem);
            this.pickerElement = pickerElem;
        }
        else {
            this.pickerElement = null;
        }
    }
}

function rgbToHslInt(r, g, b) {
    const rp = constrainRange(r / 255, 0, 1);
    const gp = constrainRange(g / 255, 0, 1);
    const bp = constrainRange(b / 255, 0, 1);
    const cmax = Math.max(rp, gp, bp);
    const cmin = Math.min(rp, gp, bp);
    const c = cmax - cmin;
    let h = 0;
    let s = 0;
    const l = (cmin + cmax) / 2;
    if (c !== 0) {
        s = c / (1 - Math.abs(cmax + cmin - 1));
        if (rp === cmax) {
            h = (gp - bp) / c;
        }
        else if (gp === cmax) {
            h = 2 + (bp - rp) / c;
        }
        else {
            h = 4 + (rp - gp) / c;
        }
        h = h / 6 + (h < 0 ? 1 : 0);
    }
    return [h * 360, s * 100, l * 100];
}
function hslToRgbInt(h, s, l) {
    const hp = ((h % 360) + 360) % 360;
    const sp = constrainRange(s / 100, 0, 1);
    const lp = constrainRange(l / 100, 0, 1);
    const c = (1 - Math.abs(2 * lp - 1)) * sp;
    const x = c * (1 - Math.abs(((hp / 60) % 2) - 1));
    const m = lp - c / 2;
    let rp, gp, bp;
    if (hp >= 0 && hp < 60) {
        [rp, gp, bp] = [c, x, 0];
    }
    else if (hp >= 60 && hp < 120) {
        [rp, gp, bp] = [x, c, 0];
    }
    else if (hp >= 120 && hp < 180) {
        [rp, gp, bp] = [0, c, x];
    }
    else if (hp >= 180 && hp < 240) {
        [rp, gp, bp] = [0, x, c];
    }
    else if (hp >= 240 && hp < 300) {
        [rp, gp, bp] = [x, 0, c];
    }
    else {
        [rp, gp, bp] = [c, 0, x];
    }
    return [(rp + m) * 255, (gp + m) * 255, (bp + m) * 255];
}
function rgbToHsvInt(r, g, b) {
    const rp = constrainRange(r / 255, 0, 1);
    const gp = constrainRange(g / 255, 0, 1);
    const bp = constrainRange(b / 255, 0, 1);
    const cmax = Math.max(rp, gp, bp);
    const cmin = Math.min(rp, gp, bp);
    const d = cmax - cmin;
    let h;
    if (d === 0) {
        h = 0;
    }
    else if (cmax === rp) {
        h = 60 * (((((gp - bp) / d) % 6) + 6) % 6);
    }
    else if (cmax === gp) {
        h = 60 * ((bp - rp) / d + 2);
    }
    else {
        h = 60 * ((rp - gp) / d + 4);
    }
    const s = cmax === 0 ? 0 : d / cmax;
    const v = cmax;
    return [h, s * 100, v * 100];
}
function hsvToRgbInt(h, s, v) {
    const hp = loopRange(h, 360);
    const sp = constrainRange(s / 100, 0, 1);
    const vp = constrainRange(v / 100, 0, 1);
    const c = vp * sp;
    const x = c * (1 - Math.abs(((hp / 60) % 2) - 1));
    const m = vp - c;
    let rp, gp, bp;
    if (hp >= 0 && hp < 60) {
        [rp, gp, bp] = [c, x, 0];
    }
    else if (hp >= 60 && hp < 120) {
        [rp, gp, bp] = [x, c, 0];
    }
    else if (hp >= 120 && hp < 180) {
        [rp, gp, bp] = [0, c, x];
    }
    else if (hp >= 180 && hp < 240) {
        [rp, gp, bp] = [0, x, c];
    }
    else if (hp >= 240 && hp < 300) {
        [rp, gp, bp] = [x, 0, c];
    }
    else {
        [rp, gp, bp] = [c, 0, x];
    }
    return [(rp + m) * 255, (gp + m) * 255, (bp + m) * 255];
}
function hslToHsvInt(h, s, l) {
    const sd = l + (s * (100 - Math.abs(2 * l - 100))) / (2 * 100);
    return [
        h,
        sd !== 0 ? (s * (100 - Math.abs(2 * l - 100))) / sd : 0,
        l + (s * (100 - Math.abs(2 * l - 100))) / (2 * 100),
    ];
}
function hsvToHslInt(h, s, v) {
    const sd = 100 - Math.abs((v * (200 - s)) / 100 - 100);
    return [h, sd !== 0 ? (s * v) / sd : 0, (v * (200 - s)) / (2 * 100)];
}
function removeAlphaComponent(comps) {
    return [comps[0], comps[1], comps[2]];
}
function appendAlphaComponent(comps, alpha) {
    return [comps[0], comps[1], comps[2], alpha];
}
const MODE_CONVERTER_MAP = {
    hsl: {
        hsl: (h, s, l) => [h, s, l],
        hsv: hslToHsvInt,
        rgb: hslToRgbInt,
    },
    hsv: {
        hsl: hsvToHslInt,
        hsv: (h, s, v) => [h, s, v],
        rgb: hsvToRgbInt,
    },
    rgb: {
        hsl: rgbToHslInt,
        hsv: rgbToHsvInt,
        rgb: (r, g, b) => [r, g, b],
    },
};
function getColorMaxComponents(mode, type) {
    return [
        type === 'float' ? 1 : mode === 'rgb' ? 255 : 360,
        type === 'float' ? 1 : mode === 'rgb' ? 255 : 100,
        type === 'float' ? 1 : mode === 'rgb' ? 255 : 100,
    ];
}
function loopHueRange(hue, max) {
    return hue === max ? max : loopRange(hue, max);
}
function constrainColorComponents(components, mode, type) {
    var _a;
    const ms = getColorMaxComponents(mode, type);
    return [
        mode === 'rgb'
            ? constrainRange(components[0], 0, ms[0])
            : loopHueRange(components[0], ms[0]),
        constrainRange(components[1], 0, ms[1]),
        constrainRange(components[2], 0, ms[2]),
        constrainRange((_a = components[3]) !== null && _a !== void 0 ? _a : 1, 0, 1),
    ];
}
function convertColorType(comps, mode, from, to) {
    const fms = getColorMaxComponents(mode, from);
    const tms = getColorMaxComponents(mode, to);
    return comps.map((c, index) => (c / fms[index]) * tms[index]);
}
function convertColor(components, from, to) {
    const intComps = convertColorType(components, from.mode, from.type, 'int');
    const result = MODE_CONVERTER_MAP[from.mode][to.mode](...intComps);
    return convertColorType(result, to.mode, 'int', to.type);
}

class IntColor {
    static black() {
        return new IntColor([0, 0, 0], 'rgb');
    }
    constructor(comps, mode) {
        this.type = 'int';
        this.mode = mode;
        this.comps_ = constrainColorComponents(comps, mode, this.type);
    }
    getComponents(opt_mode) {
        return appendAlphaComponent(convertColor(removeAlphaComponent(this.comps_), { mode: this.mode, type: this.type }, { mode: opt_mode !== null && opt_mode !== void 0 ? opt_mode : this.mode, type: this.type }), this.comps_[3]);
    }
    toRgbaObject() {
        const rgbComps = this.getComponents('rgb');
        return {
            r: rgbComps[0],
            g: rgbComps[1],
            b: rgbComps[2],
            a: rgbComps[3],
        };
    }
}

const cn$d = ClassName('colp');
class ColorPickerView {
    constructor(doc, config) {
        this.alphaViews_ = null;
        this.element = doc.createElement('div');
        this.element.classList.add(cn$d());
        config.viewProps.bindClassModifiers(this.element);
        const hsvElem = doc.createElement('div');
        hsvElem.classList.add(cn$d('hsv'));
        const svElem = doc.createElement('div');
        svElem.classList.add(cn$d('sv'));
        this.svPaletteView_ = config.svPaletteView;
        svElem.appendChild(this.svPaletteView_.element);
        hsvElem.appendChild(svElem);
        const hElem = doc.createElement('div');
        hElem.classList.add(cn$d('h'));
        this.hPaletteView_ = config.hPaletteView;
        hElem.appendChild(this.hPaletteView_.element);
        hsvElem.appendChild(hElem);
        this.element.appendChild(hsvElem);
        const rgbElem = doc.createElement('div');
        rgbElem.classList.add(cn$d('rgb'));
        this.textsView_ = config.textsView;
        rgbElem.appendChild(this.textsView_.element);
        this.element.appendChild(rgbElem);
        if (config.alphaViews) {
            this.alphaViews_ = {
                palette: config.alphaViews.palette,
                text: config.alphaViews.text,
            };
            const aElem = doc.createElement('div');
            aElem.classList.add(cn$d('a'));
            const apElem = doc.createElement('div');
            apElem.classList.add(cn$d('ap'));
            apElem.appendChild(this.alphaViews_.palette.element);
            aElem.appendChild(apElem);
            const atElem = doc.createElement('div');
            atElem.classList.add(cn$d('at'));
            atElem.appendChild(this.alphaViews_.text.element);
            aElem.appendChild(atElem);
            this.element.appendChild(aElem);
        }
    }
    get allFocusableElements() {
        const elems = [
            this.svPaletteView_.element,
            this.hPaletteView_.element,
            this.textsView_.modeSelectElement,
            ...this.textsView_.inputViews.map((v) => v.inputElement),
        ];
        if (this.alphaViews_) {
            elems.push(this.alphaViews_.palette.element, this.alphaViews_.text.inputElement);
        }
        return elems;
    }
}

function parseColorType(value) {
    return value === 'int' ? 'int' : value === 'float' ? 'float' : undefined;
}
function parseColorInputParams(params) {
    return parseRecord(params, (p) => ({
        color: p.optional.object({
            alpha: p.optional.boolean,
            type: p.optional.custom(parseColorType),
        }),
        expanded: p.optional.boolean,
        picker: p.optional.custom(parsePickerLayout),
        readonly: p.optional.constant(false),
    }));
}
function getKeyScaleForColor(forAlpha) {
    return forAlpha ? 0.1 : 1;
}
function extractColorType(params) {
    var _a;
    return (_a = params.color) === null || _a === void 0 ? void 0 : _a.type;
}

class FloatColor {
    constructor(comps, mode) {
        this.type = 'float';
        this.mode = mode;
        this.comps_ = constrainColorComponents(comps, mode, this.type);
    }
    getComponents(opt_mode) {
        return appendAlphaComponent(convertColor(removeAlphaComponent(this.comps_), { mode: this.mode, type: this.type }, { mode: opt_mode !== null && opt_mode !== void 0 ? opt_mode : this.mode, type: this.type }), this.comps_[3]);
    }
    toRgbaObject() {
        const rgbComps = this.getComponents('rgb');
        return {
            r: rgbComps[0],
            g: rgbComps[1],
            b: rgbComps[2],
            a: rgbComps[3],
        };
    }
}

const TYPE_TO_CONSTRUCTOR_MAP = {
    int: (comps, mode) => new IntColor(comps, mode),
    float: (comps, mode) => new FloatColor(comps, mode),
};
function createColor(comps, mode, type) {
    return TYPE_TO_CONSTRUCTOR_MAP[type](comps, mode);
}
function isFloatColor(c) {
    return c.type === 'float';
}
function isIntColor(c) {
    return c.type === 'int';
}
function convertFloatToInt(cf) {
    const comps = cf.getComponents();
    const ms = getColorMaxComponents(cf.mode, 'int');
    return new IntColor([
        Math.round(mapRange(comps[0], 0, 1, 0, ms[0])),
        Math.round(mapRange(comps[1], 0, 1, 0, ms[1])),
        Math.round(mapRange(comps[2], 0, 1, 0, ms[2])),
        comps[3],
    ], cf.mode);
}
function convertIntToFloat(ci) {
    const comps = ci.getComponents();
    const ms = getColorMaxComponents(ci.mode, 'int');
    return new FloatColor([
        mapRange(comps[0], 0, ms[0], 0, 1),
        mapRange(comps[1], 0, ms[1], 0, 1),
        mapRange(comps[2], 0, ms[2], 0, 1),
        comps[3],
    ], ci.mode);
}
function mapColorType(c, type) {
    if (c.type === type) {
        return c;
    }
    if (isIntColor(c) && type === 'float') {
        return convertIntToFloat(c);
    }
    if (isFloatColor(c) && type === 'int') {
        return convertFloatToInt(c);
    }
    throw TpError.shouldNeverHappen();
}

function equalsStringColorFormat(f1, f2) {
    return (f1.alpha === f2.alpha &&
        f1.mode === f2.mode &&
        f1.notation === f2.notation &&
        f1.type === f2.type);
}
function parseCssNumberOrPercentage(text, max) {
    const m = text.match(/^(.+)%$/);
    if (!m) {
        return Math.min(parseFloat(text), max);
    }
    return Math.min(parseFloat(m[1]) * 0.01 * max, max);
}
const ANGLE_TO_DEG_MAP = {
    deg: (angle) => angle,
    grad: (angle) => (angle * 360) / 400,
    rad: (angle) => (angle * 360) / (2 * Math.PI),
    turn: (angle) => angle * 360,
};
function parseCssNumberOrAngle(text) {
    const m = text.match(/^([0-9.]+?)(deg|grad|rad|turn)$/);
    if (!m) {
        return parseFloat(text);
    }
    const angle = parseFloat(m[1]);
    const unit = m[2];
    return ANGLE_TO_DEG_MAP[unit](angle);
}
function parseFunctionalRgbColorComponents(text) {
    const m = text.match(/^rgb\(\s*([0-9A-Fa-f.]+%?)\s*,\s*([0-9A-Fa-f.]+%?)\s*,\s*([0-9A-Fa-f.]+%?)\s*\)$/);
    if (!m) {
        return null;
    }
    const comps = [
        parseCssNumberOrPercentage(m[1], 255),
        parseCssNumberOrPercentage(m[2], 255),
        parseCssNumberOrPercentage(m[3], 255),
    ];
    if (isNaN(comps[0]) || isNaN(comps[1]) || isNaN(comps[2])) {
        return null;
    }
    return comps;
}
function parseFunctionalRgbColor(text) {
    const comps = parseFunctionalRgbColorComponents(text);
    return comps ? new IntColor(comps, 'rgb') : null;
}
function parseFunctionalRgbaColorComponents(text) {
    const m = text.match(/^rgba\(\s*([0-9A-Fa-f.]+%?)\s*,\s*([0-9A-Fa-f.]+%?)\s*,\s*([0-9A-Fa-f.]+%?)\s*,\s*([0-9A-Fa-f.]+%?)\s*\)$/);
    if (!m) {
        return null;
    }
    const comps = [
        parseCssNumberOrPercentage(m[1], 255),
        parseCssNumberOrPercentage(m[2], 255),
        parseCssNumberOrPercentage(m[3], 255),
        parseCssNumberOrPercentage(m[4], 1),
    ];
    if (isNaN(comps[0]) ||
        isNaN(comps[1]) ||
        isNaN(comps[2]) ||
        isNaN(comps[3])) {
        return null;
    }
    return comps;
}
function parseFunctionalRgbaColor(text) {
    const comps = parseFunctionalRgbaColorComponents(text);
    return comps ? new IntColor(comps, 'rgb') : null;
}
function parseFunctionalHslColorComponents(text) {
    const m = text.match(/^hsl\(\s*([0-9A-Fa-f.]+(?:deg|grad|rad|turn)?)\s*,\s*([0-9A-Fa-f.]+%?)\s*,\s*([0-9A-Fa-f.]+%?)\s*\)$/);
    if (!m) {
        return null;
    }
    const comps = [
        parseCssNumberOrAngle(m[1]),
        parseCssNumberOrPercentage(m[2], 100),
        parseCssNumberOrPercentage(m[3], 100),
    ];
    if (isNaN(comps[0]) || isNaN(comps[1]) || isNaN(comps[2])) {
        return null;
    }
    return comps;
}
function parseFunctionalHslColor(text) {
    const comps = parseFunctionalHslColorComponents(text);
    return comps ? new IntColor(comps, 'hsl') : null;
}
function parseHslaColorComponents(text) {
    const m = text.match(/^hsla\(\s*([0-9A-Fa-f.]+(?:deg|grad|rad|turn)?)\s*,\s*([0-9A-Fa-f.]+%?)\s*,\s*([0-9A-Fa-f.]+%?)\s*,\s*([0-9A-Fa-f.]+%?)\s*\)$/);
    if (!m) {
        return null;
    }
    const comps = [
        parseCssNumberOrAngle(m[1]),
        parseCssNumberOrPercentage(m[2], 100),
        parseCssNumberOrPercentage(m[3], 100),
        parseCssNumberOrPercentage(m[4], 1),
    ];
    if (isNaN(comps[0]) ||
        isNaN(comps[1]) ||
        isNaN(comps[2]) ||
        isNaN(comps[3])) {
        return null;
    }
    return comps;
}
function parseFunctionalHslaColor(text) {
    const comps = parseHslaColorComponents(text);
    return comps ? new IntColor(comps, 'hsl') : null;
}
function parseHexRgbColorComponents(text) {
    const mRgb = text.match(/^#([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])$/);
    if (mRgb) {
        return [
            parseInt(mRgb[1] + mRgb[1], 16),
            parseInt(mRgb[2] + mRgb[2], 16),
            parseInt(mRgb[3] + mRgb[3], 16),
        ];
    }
    const mRrggbb = text.match(/^(?:#|0x)([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/);
    if (mRrggbb) {
        return [
            parseInt(mRrggbb[1], 16),
            parseInt(mRrggbb[2], 16),
            parseInt(mRrggbb[3], 16),
        ];
    }
    return null;
}
function parseHexRgbColor(text) {
    const comps = parseHexRgbColorComponents(text);
    return comps ? new IntColor(comps, 'rgb') : null;
}
function parseHexRgbaColorComponents(text) {
    const mRgb = text.match(/^#([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])$/);
    if (mRgb) {
        return [
            parseInt(mRgb[1] + mRgb[1], 16),
            parseInt(mRgb[2] + mRgb[2], 16),
            parseInt(mRgb[3] + mRgb[3], 16),
            mapRange(parseInt(mRgb[4] + mRgb[4], 16), 0, 255, 0, 1),
        ];
    }
    const mRrggbb = text.match(/^(?:#|0x)?([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/);
    if (mRrggbb) {
        return [
            parseInt(mRrggbb[1], 16),
            parseInt(mRrggbb[2], 16),
            parseInt(mRrggbb[3], 16),
            mapRange(parseInt(mRrggbb[4], 16), 0, 255, 0, 1),
        ];
    }
    return null;
}
function parseHexRgbaColor(text) {
    const comps = parseHexRgbaColorComponents(text);
    return comps ? new IntColor(comps, 'rgb') : null;
}
function parseObjectRgbColorComponents(text) {
    const m = text.match(/^\{\s*r\s*:\s*([0-9A-Fa-f.]+%?)\s*,\s*g\s*:\s*([0-9A-Fa-f.]+%?)\s*,\s*b\s*:\s*([0-9A-Fa-f.]+%?)\s*\}$/);
    if (!m) {
        return null;
    }
    const comps = [
        parseFloat(m[1]),
        parseFloat(m[2]),
        parseFloat(m[3]),
    ];
    if (isNaN(comps[0]) || isNaN(comps[1]) || isNaN(comps[2])) {
        return null;
    }
    return comps;
}
function createObjectRgbColorParser(type) {
    return (text) => {
        const comps = parseObjectRgbColorComponents(text);
        return comps ? createColor(comps, 'rgb', type) : null;
    };
}
function parseObjectRgbaColorComponents(text) {
    const m = text.match(/^\{\s*r\s*:\s*([0-9A-Fa-f.]+%?)\s*,\s*g\s*:\s*([0-9A-Fa-f.]+%?)\s*,\s*b\s*:\s*([0-9A-Fa-f.]+%?)\s*,\s*a\s*:\s*([0-9A-Fa-f.]+%?)\s*\}$/);
    if (!m) {
        return null;
    }
    const comps = [
        parseFloat(m[1]),
        parseFloat(m[2]),
        parseFloat(m[3]),
        parseFloat(m[4]),
    ];
    if (isNaN(comps[0]) ||
        isNaN(comps[1]) ||
        isNaN(comps[2]) ||
        isNaN(comps[3])) {
        return null;
    }
    return comps;
}
function createObjectRgbaColorParser(type) {
    return (text) => {
        const comps = parseObjectRgbaColorComponents(text);
        return comps ? createColor(comps, 'rgb', type) : null;
    };
}
const PARSER_AND_RESULT = [
    {
        parser: parseHexRgbColorComponents,
        result: {
            alpha: false,
            mode: 'rgb',
            notation: 'hex',
        },
    },
    {
        parser: parseHexRgbaColorComponents,
        result: {
            alpha: true,
            mode: 'rgb',
            notation: 'hex',
        },
    },
    {
        parser: parseFunctionalRgbColorComponents,
        result: {
            alpha: false,
            mode: 'rgb',
            notation: 'func',
        },
    },
    {
        parser: parseFunctionalRgbaColorComponents,
        result: {
            alpha: true,
            mode: 'rgb',
            notation: 'func',
        },
    },
    {
        parser: parseFunctionalHslColorComponents,
        result: {
            alpha: false,
            mode: 'hsl',
            notation: 'func',
        },
    },
    {
        parser: parseHslaColorComponents,
        result: {
            alpha: true,
            mode: 'hsl',
            notation: 'func',
        },
    },
    {
        parser: parseObjectRgbColorComponents,
        result: {
            alpha: false,
            mode: 'rgb',
            notation: 'object',
        },
    },
    {
        parser: parseObjectRgbaColorComponents,
        result: {
            alpha: true,
            mode: 'rgb',
            notation: 'object',
        },
    },
];
function detectStringColor(text) {
    return PARSER_AND_RESULT.reduce((prev, { parser, result: detection }) => {
        if (prev) {
            return prev;
        }
        return parser(text) ? detection : null;
    }, null);
}
function detectStringColorFormat(text, type = 'int') {
    const r = detectStringColor(text);
    if (!r) {
        return null;
    }
    if (r.notation === 'hex' && type !== 'float') {
        return Object.assign(Object.assign({}, r), { type: 'int' });
    }
    if (r.notation === 'func') {
        return Object.assign(Object.assign({}, r), { type: type });
    }
    return null;
}
function createColorStringParser(type) {
    const parsers = [
        parseHexRgbColor,
        parseHexRgbaColor,
        parseFunctionalRgbColor,
        parseFunctionalRgbaColor,
        parseFunctionalHslColor,
        parseFunctionalHslaColor,
    ];
    if (type === 'int') {
        parsers.push(createObjectRgbColorParser('int'), createObjectRgbaColorParser('int'));
    }
    if (type === 'float') {
        parsers.push(createObjectRgbColorParser('float'), createObjectRgbaColorParser('float'));
    }
    const parser = composeParsers(parsers);
    return (text) => {
        const result = parser(text);
        return result ? mapColorType(result, type) : null;
    };
}
function readIntColorString(value) {
    const parser = createColorStringParser('int');
    if (typeof value !== 'string') {
        return IntColor.black();
    }
    const result = parser(value);
    return result !== null && result !== void 0 ? result : IntColor.black();
}
function zerofill(comp) {
    const hex = constrainRange(Math.floor(comp), 0, 255).toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
}
function colorToHexRgbString(value, prefix = '#') {
    const hexes = removeAlphaComponent(value.getComponents('rgb'))
        .map(zerofill)
        .join('');
    return `${prefix}${hexes}`;
}
function colorToHexRgbaString(value, prefix = '#') {
    const rgbaComps = value.getComponents('rgb');
    const hexes = [rgbaComps[0], rgbaComps[1], rgbaComps[2], rgbaComps[3] * 255]
        .map(zerofill)
        .join('');
    return `${prefix}${hexes}`;
}
function colorToFunctionalRgbString(value) {
    const formatter = createNumberFormatter(0);
    const ci = mapColorType(value, 'int');
    const comps = removeAlphaComponent(ci.getComponents('rgb')).map((comp) => formatter(comp));
    return `rgb(${comps.join(', ')})`;
}
function colorToFunctionalRgbaString(value) {
    const aFormatter = createNumberFormatter(2);
    const rgbFormatter = createNumberFormatter(0);
    const ci = mapColorType(value, 'int');
    const comps = ci.getComponents('rgb').map((comp, index) => {
        const formatter = index === 3 ? aFormatter : rgbFormatter;
        return formatter(comp);
    });
    return `rgba(${comps.join(', ')})`;
}
function colorToFunctionalHslString(value) {
    const formatters = [
        createNumberFormatter(0),
        formatPercentage,
        formatPercentage,
    ];
    const ci = mapColorType(value, 'int');
    const comps = removeAlphaComponent(ci.getComponents('hsl')).map((comp, index) => formatters[index](comp));
    return `hsl(${comps.join(', ')})`;
}
function colorToFunctionalHslaString(value) {
    const formatters = [
        createNumberFormatter(0),
        formatPercentage,
        formatPercentage,
        createNumberFormatter(2),
    ];
    const ci = mapColorType(value, 'int');
    const comps = ci
        .getComponents('hsl')
        .map((comp, index) => formatters[index](comp));
    return `hsla(${comps.join(', ')})`;
}
function colorToObjectRgbString(value, type) {
    const formatter = createNumberFormatter(type === 'float' ? 2 : 0);
    const names = ['r', 'g', 'b'];
    const cc = mapColorType(value, type);
    const comps = removeAlphaComponent(cc.getComponents('rgb')).map((comp, index) => `${names[index]}: ${formatter(comp)}`);
    return `{${comps.join(', ')}}`;
}
function createObjectRgbColorFormatter(type) {
    return (value) => colorToObjectRgbString(value, type);
}
function colorToObjectRgbaString(value, type) {
    const aFormatter = createNumberFormatter(2);
    const rgbFormatter = createNumberFormatter(type === 'float' ? 2 : 0);
    const names = ['r', 'g', 'b', 'a'];
    const cc = mapColorType(value, type);
    const comps = cc.getComponents('rgb').map((comp, index) => {
        const formatter = index === 3 ? aFormatter : rgbFormatter;
        return `${names[index]}: ${formatter(comp)}`;
    });
    return `{${comps.join(', ')}}`;
}
function createObjectRgbaColorFormatter(type) {
    return (value) => colorToObjectRgbaString(value, type);
}
const FORMAT_AND_STRINGIFIERS = [
    {
        format: {
            alpha: false,
            mode: 'rgb',
            notation: 'hex',
            type: 'int',
        },
        stringifier: colorToHexRgbString,
    },
    {
        format: {
            alpha: true,
            mode: 'rgb',
            notation: 'hex',
            type: 'int',
        },
        stringifier: colorToHexRgbaString,
    },
    {
        format: {
            alpha: false,
            mode: 'rgb',
            notation: 'func',
            type: 'int',
        },
        stringifier: colorToFunctionalRgbString,
    },
    {
        format: {
            alpha: true,
            mode: 'rgb',
            notation: 'func',
            type: 'int',
        },
        stringifier: colorToFunctionalRgbaString,
    },
    {
        format: {
            alpha: false,
            mode: 'hsl',
            notation: 'func',
            type: 'int',
        },
        stringifier: colorToFunctionalHslString,
    },
    {
        format: {
            alpha: true,
            mode: 'hsl',
            notation: 'func',
            type: 'int',
        },
        stringifier: colorToFunctionalHslaString,
    },
    ...['int', 'float'].reduce((prev, type) => {
        return [
            ...prev,
            {
                format: {
                    alpha: false,
                    mode: 'rgb',
                    notation: 'object',
                    type: type,
                },
                stringifier: createObjectRgbColorFormatter(type),
            },
            {
                format: {
                    alpha: true,
                    mode: 'rgb',
                    notation: 'object',
                    type: type,
                },
                stringifier: createObjectRgbaColorFormatter(type),
            },
        ];
    }, []),
];
function findColorStringifier(format) {
    return FORMAT_AND_STRINGIFIERS.reduce((prev, fas) => {
        if (prev) {
            return prev;
        }
        return equalsStringColorFormat(fas.format, format)
            ? fas.stringifier
            : null;
    }, null);
}

const cn$c = ClassName('apl');
class APaletteView {
    constructor(doc, config) {
        this.onValueChange_ = this.onValueChange_.bind(this);
        this.value = config.value;
        this.value.emitter.on('change', this.onValueChange_);
        this.element = doc.createElement('div');
        this.element.classList.add(cn$c());
        config.viewProps.bindClassModifiers(this.element);
        config.viewProps.bindTabIndex(this.element);
        const barElem = doc.createElement('div');
        barElem.classList.add(cn$c('b'));
        this.element.appendChild(barElem);
        const colorElem = doc.createElement('div');
        colorElem.classList.add(cn$c('c'));
        barElem.appendChild(colorElem);
        this.colorElem_ = colorElem;
        const markerElem = doc.createElement('div');
        markerElem.classList.add(cn$c('m'));
        this.element.appendChild(markerElem);
        this.markerElem_ = markerElem;
        const previewElem = doc.createElement('div');
        previewElem.classList.add(cn$c('p'));
        this.markerElem_.appendChild(previewElem);
        this.previewElem_ = previewElem;
        this.update_();
    }
    update_() {
        const c = this.value.rawValue;
        const rgbaComps = c.getComponents('rgb');
        const leftColor = new IntColor([rgbaComps[0], rgbaComps[1], rgbaComps[2], 0], 'rgb');
        const rightColor = new IntColor([rgbaComps[0], rgbaComps[1], rgbaComps[2], 255], 'rgb');
        const gradientComps = [
            'to right',
            colorToFunctionalRgbaString(leftColor),
            colorToFunctionalRgbaString(rightColor),
        ];
        this.colorElem_.style.background = `linear-gradient(${gradientComps.join(',')})`;
        this.previewElem_.style.backgroundColor = colorToFunctionalRgbaString(c);
        const left = mapRange(rgbaComps[3], 0, 1, 0, 100);
        this.markerElem_.style.left = `${left}%`;
    }
    onValueChange_() {
        this.update_();
    }
}

class APaletteController {
    constructor(doc, config) {
        this.onKeyDown_ = this.onKeyDown_.bind(this);
        this.onKeyUp_ = this.onKeyUp_.bind(this);
        this.onPointerDown_ = this.onPointerDown_.bind(this);
        this.onPointerMove_ = this.onPointerMove_.bind(this);
        this.onPointerUp_ = this.onPointerUp_.bind(this);
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.view = new APaletteView(doc, {
            value: this.value,
            viewProps: this.viewProps,
        });
        this.ptHandler_ = new PointerHandler(this.view.element);
        this.ptHandler_.emitter.on('down', this.onPointerDown_);
        this.ptHandler_.emitter.on('move', this.onPointerMove_);
        this.ptHandler_.emitter.on('up', this.onPointerUp_);
        this.view.element.addEventListener('keydown', this.onKeyDown_);
        this.view.element.addEventListener('keyup', this.onKeyUp_);
    }
    handlePointerEvent_(d, opts) {
        if (!d.point) {
            return;
        }
        const alpha = d.point.x / d.bounds.width;
        const c = this.value.rawValue;
        const [h, s, v] = c.getComponents('hsv');
        this.value.setRawValue(new IntColor([h, s, v, alpha], 'hsv'), opts);
    }
    onPointerDown_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: false,
            last: false,
        });
    }
    onPointerMove_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: false,
            last: false,
        });
    }
    onPointerUp_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: true,
            last: true,
        });
    }
    onKeyDown_(ev) {
        const step = getStepForKey(getKeyScaleForColor(true), getHorizontalStepKeys(ev));
        if (step === 0) {
            return;
        }
        const c = this.value.rawValue;
        const [h, s, v, a] = c.getComponents('hsv');
        this.value.setRawValue(new IntColor([h, s, v, a + step], 'hsv'), {
            forceEmit: false,
            last: false,
        });
    }
    onKeyUp_(ev) {
        const step = getStepForKey(getKeyScaleForColor(true), getHorizontalStepKeys(ev));
        if (step === 0) {
            return;
        }
        this.value.setRawValue(this.value.rawValue, {
            forceEmit: true,
            last: true,
        });
    }
}

const cn$b = ClassName('coltxt');
function createModeSelectElement(doc) {
    const selectElem = doc.createElement('select');
    const items = [
        { text: 'RGB', value: 'rgb' },
        { text: 'HSL', value: 'hsl' },
        { text: 'HSV', value: 'hsv' },
        { text: 'HEX', value: 'hex' },
    ];
    selectElem.appendChild(items.reduce((frag, item) => {
        const optElem = doc.createElement('option');
        optElem.textContent = item.text;
        optElem.value = item.value;
        frag.appendChild(optElem);
        return frag;
    }, doc.createDocumentFragment()));
    return selectElem;
}
class ColorTextsView {
    constructor(doc, config) {
        this.element = doc.createElement('div');
        this.element.classList.add(cn$b());
        config.viewProps.bindClassModifiers(this.element);
        const modeElem = doc.createElement('div');
        modeElem.classList.add(cn$b('m'));
        this.modeElem_ = createModeSelectElement(doc);
        this.modeElem_.classList.add(cn$b('ms'));
        modeElem.appendChild(this.modeSelectElement);
        config.viewProps.bindDisabled(this.modeElem_);
        const modeMarkerElem = doc.createElement('div');
        modeMarkerElem.classList.add(cn$b('mm'));
        modeMarkerElem.appendChild(createSvgIconElement(doc, 'dropdown'));
        modeElem.appendChild(modeMarkerElem);
        this.element.appendChild(modeElem);
        const inputsElem = doc.createElement('div');
        inputsElem.classList.add(cn$b('w'));
        this.element.appendChild(inputsElem);
        this.inputsElem_ = inputsElem;
        this.inputViews_ = config.inputViews;
        this.applyInputViews_();
        bindValue(config.mode, (mode) => {
            this.modeElem_.value = mode;
        });
    }
    get modeSelectElement() {
        return this.modeElem_;
    }
    get inputViews() {
        return this.inputViews_;
    }
    set inputViews(inputViews) {
        this.inputViews_ = inputViews;
        this.applyInputViews_();
    }
    applyInputViews_() {
        removeChildElements(this.inputsElem_);
        const doc = this.element.ownerDocument;
        this.inputViews_.forEach((v) => {
            const compElem = doc.createElement('div');
            compElem.classList.add(cn$b('c'));
            compElem.appendChild(v.element);
            this.inputsElem_.appendChild(compElem);
        });
    }
}

function createFormatter$2(type) {
    return createNumberFormatter(type === 'float' ? 2 : 0);
}
function createConstraint$5(mode, type, index) {
    const max = getColorMaxComponents(mode, type)[index];
    return new DefiniteRangeConstraint({
        min: 0,
        max: max,
    });
}
function createComponentController(doc, config, index) {
    return new NumberTextController(doc, {
        arrayPosition: index === 0 ? 'fst' : index === 3 - 1 ? 'lst' : 'mid',
        parser: config.parser,
        props: ValueMap.fromObject({
            formatter: createFormatter$2(config.colorType),
            keyScale: getKeyScaleForColor(false),
            pointerScale: config.colorType === 'float' ? 0.01 : 1,
        }),
        value: createValue(0, {
            constraint: createConstraint$5(config.colorMode, config.colorType, index),
        }),
        viewProps: config.viewProps,
    });
}
function createComponentControllers(doc, config) {
    const cc = {
        colorMode: config.colorMode,
        colorType: config.colorType,
        parser: parseNumber,
        viewProps: config.viewProps,
    };
    return [0, 1, 2].map((i) => {
        const c = createComponentController(doc, cc, i);
        connectValues({
            primary: config.value,
            secondary: c.value,
            forward(p) {
                const mc = mapColorType(p, config.colorType);
                return mc.getComponents(config.colorMode)[i];
            },
            backward(p, s) {
                const pickedMode = config.colorMode;
                const mc = mapColorType(p, config.colorType);
                const comps = mc.getComponents(pickedMode);
                comps[i] = s;
                const c = createColor(appendAlphaComponent(removeAlphaComponent(comps), comps[3]), pickedMode, config.colorType);
                return mapColorType(c, 'int');
            },
        });
        return c;
    });
}
function createHexController(doc, config) {
    const c = new TextController(doc, {
        parser: createColorStringParser('int'),
        props: ValueMap.fromObject({
            formatter: colorToHexRgbString,
        }),
        value: createValue(IntColor.black()),
        viewProps: config.viewProps,
    });
    connectValues({
        primary: config.value,
        secondary: c.value,
        forward: (p) => new IntColor(removeAlphaComponent(p.getComponents()), p.mode),
        backward: (p, s) => new IntColor(appendAlphaComponent(removeAlphaComponent(s.getComponents(p.mode)), p.getComponents()[3]), p.mode),
    });
    return [c];
}
function isColorMode(mode) {
    return mode !== 'hex';
}
class ColorTextsController {
    constructor(doc, config) {
        this.onModeSelectChange_ = this.onModeSelectChange_.bind(this);
        this.colorType_ = config.colorType;
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.colorMode = createValue(this.value.rawValue.mode);
        this.ccs_ = this.createComponentControllers_(doc);
        this.view = new ColorTextsView(doc, {
            mode: this.colorMode,
            inputViews: [this.ccs_[0].view, this.ccs_[1].view, this.ccs_[2].view],
            viewProps: this.viewProps,
        });
        this.view.modeSelectElement.addEventListener('change', this.onModeSelectChange_);
    }
    createComponentControllers_(doc) {
        const mode = this.colorMode.rawValue;
        if (isColorMode(mode)) {
            return createComponentControllers(doc, {
                colorMode: mode,
                colorType: this.colorType_,
                value: this.value,
                viewProps: this.viewProps,
            });
        }
        return createHexController(doc, {
            value: this.value,
            viewProps: this.viewProps,
        });
    }
    onModeSelectChange_(ev) {
        const selectElem = ev.currentTarget;
        this.colorMode.rawValue = selectElem.value;
        this.ccs_ = this.createComponentControllers_(this.view.element.ownerDocument);
        this.view.inputViews = this.ccs_.map((cc) => cc.view);
    }
}

const cn$a = ClassName('hpl');
class HPaletteView {
    constructor(doc, config) {
        this.onValueChange_ = this.onValueChange_.bind(this);
        this.value = config.value;
        this.value.emitter.on('change', this.onValueChange_);
        this.element = doc.createElement('div');
        this.element.classList.add(cn$a());
        config.viewProps.bindClassModifiers(this.element);
        config.viewProps.bindTabIndex(this.element);
        const colorElem = doc.createElement('div');
        colorElem.classList.add(cn$a('c'));
        this.element.appendChild(colorElem);
        const markerElem = doc.createElement('div');
        markerElem.classList.add(cn$a('m'));
        this.element.appendChild(markerElem);
        this.markerElem_ = markerElem;
        this.update_();
    }
    update_() {
        const c = this.value.rawValue;
        const [h] = c.getComponents('hsv');
        this.markerElem_.style.backgroundColor = colorToFunctionalRgbString(new IntColor([h, 100, 100], 'hsv'));
        const left = mapRange(h, 0, 360, 0, 100);
        this.markerElem_.style.left = `${left}%`;
    }
    onValueChange_() {
        this.update_();
    }
}

class HPaletteController {
    constructor(doc, config) {
        this.onKeyDown_ = this.onKeyDown_.bind(this);
        this.onKeyUp_ = this.onKeyUp_.bind(this);
        this.onPointerDown_ = this.onPointerDown_.bind(this);
        this.onPointerMove_ = this.onPointerMove_.bind(this);
        this.onPointerUp_ = this.onPointerUp_.bind(this);
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.view = new HPaletteView(doc, {
            value: this.value,
            viewProps: this.viewProps,
        });
        this.ptHandler_ = new PointerHandler(this.view.element);
        this.ptHandler_.emitter.on('down', this.onPointerDown_);
        this.ptHandler_.emitter.on('move', this.onPointerMove_);
        this.ptHandler_.emitter.on('up', this.onPointerUp_);
        this.view.element.addEventListener('keydown', this.onKeyDown_);
        this.view.element.addEventListener('keyup', this.onKeyUp_);
    }
    handlePointerEvent_(d, opts) {
        if (!d.point) {
            return;
        }
        const hue = mapRange(constrainRange(d.point.x, 0, d.bounds.width), 0, d.bounds.width, 0, 360);
        const c = this.value.rawValue;
        const [, s, v, a] = c.getComponents('hsv');
        this.value.setRawValue(new IntColor([hue, s, v, a], 'hsv'), opts);
    }
    onPointerDown_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: false,
            last: false,
        });
    }
    onPointerMove_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: false,
            last: false,
        });
    }
    onPointerUp_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: true,
            last: true,
        });
    }
    onKeyDown_(ev) {
        const step = getStepForKey(getKeyScaleForColor(false), getHorizontalStepKeys(ev));
        if (step === 0) {
            return;
        }
        const c = this.value.rawValue;
        const [h, s, v, a] = c.getComponents('hsv');
        this.value.setRawValue(new IntColor([h + step, s, v, a], 'hsv'), {
            forceEmit: false,
            last: false,
        });
    }
    onKeyUp_(ev) {
        const step = getStepForKey(getKeyScaleForColor(false), getHorizontalStepKeys(ev));
        if (step === 0) {
            return;
        }
        this.value.setRawValue(this.value.rawValue, {
            forceEmit: true,
            last: true,
        });
    }
}

const cn$9 = ClassName('svp');
const CANVAS_RESOL = 64;
class SvPaletteView {
    constructor(doc, config) {
        this.onValueChange_ = this.onValueChange_.bind(this);
        this.value = config.value;
        this.value.emitter.on('change', this.onValueChange_);
        this.element = doc.createElement('div');
        this.element.classList.add(cn$9());
        config.viewProps.bindClassModifiers(this.element);
        config.viewProps.bindTabIndex(this.element);
        const canvasElem = doc.createElement('canvas');
        canvasElem.height = CANVAS_RESOL;
        canvasElem.width = CANVAS_RESOL;
        canvasElem.classList.add(cn$9('c'));
        this.element.appendChild(canvasElem);
        this.canvasElement = canvasElem;
        const markerElem = doc.createElement('div');
        markerElem.classList.add(cn$9('m'));
        this.element.appendChild(markerElem);
        this.markerElem_ = markerElem;
        this.update_();
    }
    update_() {
        const ctx = getCanvasContext(this.canvasElement);
        if (!ctx) {
            return;
        }
        const c = this.value.rawValue;
        const hsvComps = c.getComponents('hsv');
        const width = this.canvasElement.width;
        const height = this.canvasElement.height;
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;
        for (let iy = 0; iy < height; iy++) {
            for (let ix = 0; ix < width; ix++) {
                const s = mapRange(ix, 0, width, 0, 100);
                const v = mapRange(iy, 0, height, 100, 0);
                const rgbComps = hsvToRgbInt(hsvComps[0], s, v);
                const i = (iy * width + ix) * 4;
                data[i] = rgbComps[0];
                data[i + 1] = rgbComps[1];
                data[i + 2] = rgbComps[2];
                data[i + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
        const left = mapRange(hsvComps[1], 0, 100, 0, 100);
        this.markerElem_.style.left = `${left}%`;
        const top = mapRange(hsvComps[2], 0, 100, 100, 0);
        this.markerElem_.style.top = `${top}%`;
    }
    onValueChange_() {
        this.update_();
    }
}

class SvPaletteController {
    constructor(doc, config) {
        this.onKeyDown_ = this.onKeyDown_.bind(this);
        this.onKeyUp_ = this.onKeyUp_.bind(this);
        this.onPointerDown_ = this.onPointerDown_.bind(this);
        this.onPointerMove_ = this.onPointerMove_.bind(this);
        this.onPointerUp_ = this.onPointerUp_.bind(this);
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.view = new SvPaletteView(doc, {
            value: this.value,
            viewProps: this.viewProps,
        });
        this.ptHandler_ = new PointerHandler(this.view.element);
        this.ptHandler_.emitter.on('down', this.onPointerDown_);
        this.ptHandler_.emitter.on('move', this.onPointerMove_);
        this.ptHandler_.emitter.on('up', this.onPointerUp_);
        this.view.element.addEventListener('keydown', this.onKeyDown_);
        this.view.element.addEventListener('keyup', this.onKeyUp_);
    }
    handlePointerEvent_(d, opts) {
        if (!d.point) {
            return;
        }
        const saturation = mapRange(d.point.x, 0, d.bounds.width, 0, 100);
        const value = mapRange(d.point.y, 0, d.bounds.height, 100, 0);
        const [h, , , a] = this.value.rawValue.getComponents('hsv');
        this.value.setRawValue(new IntColor([h, saturation, value, a], 'hsv'), opts);
    }
    onPointerDown_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: false,
            last: false,
        });
    }
    onPointerMove_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: false,
            last: false,
        });
    }
    onPointerUp_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: true,
            last: true,
        });
    }
    onKeyDown_(ev) {
        if (isArrowKey(ev.key)) {
            ev.preventDefault();
        }
        const [h, s, v, a] = this.value.rawValue.getComponents('hsv');
        const keyScale = getKeyScaleForColor(false);
        const ds = getStepForKey(keyScale, getHorizontalStepKeys(ev));
        const dv = getStepForKey(keyScale, getVerticalStepKeys(ev));
        if (ds === 0 && dv === 0) {
            return;
        }
        this.value.setRawValue(new IntColor([h, s + ds, v + dv, a], 'hsv'), {
            forceEmit: false,
            last: false,
        });
    }
    onKeyUp_(ev) {
        const keyScale = getKeyScaleForColor(false);
        const ds = getStepForKey(keyScale, getHorizontalStepKeys(ev));
        const dv = getStepForKey(keyScale, getVerticalStepKeys(ev));
        if (ds === 0 && dv === 0) {
            return;
        }
        this.value.setRawValue(this.value.rawValue, {
            forceEmit: true,
            last: true,
        });
    }
}

class ColorPickerController {
    constructor(doc, config) {
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.hPaletteC_ = new HPaletteController(doc, {
            value: this.value,
            viewProps: this.viewProps,
        });
        this.svPaletteC_ = new SvPaletteController(doc, {
            value: this.value,
            viewProps: this.viewProps,
        });
        this.alphaIcs_ = config.supportsAlpha
            ? {
                palette: new APaletteController(doc, {
                    value: this.value,
                    viewProps: this.viewProps,
                }),
                text: new NumberTextController(doc, {
                    parser: parseNumber,
                    props: ValueMap.fromObject({
                        pointerScale: 0.01,
                        keyScale: 0.1,
                        formatter: createNumberFormatter(2),
                    }),
                    value: createValue(0, {
                        constraint: new DefiniteRangeConstraint({ min: 0, max: 1 }),
                    }),
                    viewProps: this.viewProps,
                }),
            }
            : null;
        if (this.alphaIcs_) {
            connectValues({
                primary: this.value,
                secondary: this.alphaIcs_.text.value,
                forward: (p) => p.getComponents()[3],
                backward: (p, s) => {
                    const comps = p.getComponents();
                    comps[3] = s;
                    return new IntColor(comps, p.mode);
                },
            });
        }
        this.textsC_ = new ColorTextsController(doc, {
            colorType: config.colorType,
            value: this.value,
            viewProps: this.viewProps,
        });
        this.view = new ColorPickerView(doc, {
            alphaViews: this.alphaIcs_
                ? {
                    palette: this.alphaIcs_.palette.view,
                    text: this.alphaIcs_.text.view,
                }
                : null,
            hPaletteView: this.hPaletteC_.view,
            supportsAlpha: config.supportsAlpha,
            svPaletteView: this.svPaletteC_.view,
            textsView: this.textsC_.view,
            viewProps: this.viewProps,
        });
    }
    get textsController() {
        return this.textsC_;
    }
}

const cn$8 = ClassName('colsw');
class ColorSwatchView {
    constructor(doc, config) {
        this.onValueChange_ = this.onValueChange_.bind(this);
        config.value.emitter.on('change', this.onValueChange_);
        this.value = config.value;
        this.element = doc.createElement('div');
        this.element.classList.add(cn$8());
        config.viewProps.bindClassModifiers(this.element);
        const swatchElem = doc.createElement('div');
        swatchElem.classList.add(cn$8('sw'));
        this.element.appendChild(swatchElem);
        this.swatchElem_ = swatchElem;
        const buttonElem = doc.createElement('button');
        buttonElem.classList.add(cn$8('b'));
        config.viewProps.bindDisabled(buttonElem);
        this.element.appendChild(buttonElem);
        this.buttonElement = buttonElem;
        this.update_();
    }
    update_() {
        const value = this.value.rawValue;
        this.swatchElem_.style.backgroundColor = colorToHexRgbaString(value);
    }
    onValueChange_() {
        this.update_();
    }
}

class ColorSwatchController {
    constructor(doc, config) {
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.view = new ColorSwatchView(doc, {
            value: this.value,
            viewProps: this.viewProps,
        });
    }
}

class ColorController$1 {
    constructor(doc, config) {
        this.onButtonBlur_ = this.onButtonBlur_.bind(this);
        this.onButtonClick_ = this.onButtonClick_.bind(this);
        this.onPopupChildBlur_ = this.onPopupChildBlur_.bind(this);
        this.onPopupChildKeydown_ = this.onPopupChildKeydown_.bind(this);
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.foldable_ = Foldable.create(config.expanded);
        this.swatchC_ = new ColorSwatchController(doc, {
            value: this.value,
            viewProps: this.viewProps,
        });
        const buttonElem = this.swatchC_.view.buttonElement;
        buttonElem.addEventListener('blur', this.onButtonBlur_);
        buttonElem.addEventListener('click', this.onButtonClick_);
        this.textC_ = new TextController(doc, {
            parser: config.parser,
            props: ValueMap.fromObject({
                formatter: config.formatter,
            }),
            value: this.value,
            viewProps: this.viewProps,
        });
        this.view = new ColorView$1(doc, {
            foldable: this.foldable_,
            pickerLayout: config.pickerLayout,
        });
        this.view.swatchElement.appendChild(this.swatchC_.view.element);
        this.view.textElement.appendChild(this.textC_.view.element);
        this.popC_ =
            config.pickerLayout === 'popup'
                ? new PopupController(doc, {
                    viewProps: this.viewProps,
                })
                : null;
        const pickerC = new ColorPickerController(doc, {
            colorType: config.colorType,
            supportsAlpha: config.supportsAlpha,
            value: this.value,
            viewProps: this.viewProps,
        });
        pickerC.view.allFocusableElements.forEach((elem) => {
            elem.addEventListener('blur', this.onPopupChildBlur_);
            elem.addEventListener('keydown', this.onPopupChildKeydown_);
        });
        this.pickerC_ = pickerC;
        if (this.popC_) {
            this.view.element.appendChild(this.popC_.view.element);
            this.popC_.view.element.appendChild(pickerC.view.element);
            connectValues({
                primary: this.foldable_.value('expanded'),
                secondary: this.popC_.shows,
                forward: (p) => p,
                backward: (_, s) => s,
            });
        }
        else if (this.view.pickerElement) {
            this.view.pickerElement.appendChild(this.pickerC_.view.element);
            bindFoldable(this.foldable_, this.view.pickerElement);
        }
    }
    get textController() {
        return this.textC_;
    }
    onButtonBlur_(e) {
        if (!this.popC_) {
            return;
        }
        const elem = this.view.element;
        const nextTarget = forceCast(e.relatedTarget);
        if (!nextTarget || !elem.contains(nextTarget)) {
            this.popC_.shows.rawValue = false;
        }
    }
    onButtonClick_() {
        this.foldable_.set('expanded', !this.foldable_.get('expanded'));
        if (this.foldable_.get('expanded')) {
            this.pickerC_.view.allFocusableElements[0].focus();
        }
    }
    onPopupChildBlur_(ev) {
        if (!this.popC_) {
            return;
        }
        const elem = this.popC_.view.element;
        const nextTarget = findNextTarget(ev);
        if (nextTarget && elem.contains(nextTarget)) {
            return;
        }
        if (nextTarget &&
            nextTarget === this.swatchC_.view.buttonElement &&
            !supportsTouch(elem.ownerDocument)) {
            return;
        }
        this.popC_.shows.rawValue = false;
    }
    onPopupChildKeydown_(ev) {
        if (this.popC_) {
            if (ev.key === 'Escape') {
                this.popC_.shows.rawValue = false;
            }
        }
        else if (this.view.pickerElement) {
            if (ev.key === 'Escape') {
                this.swatchC_.view.buttonElement.focus();
            }
        }
    }
}

function colorToRgbNumber(value) {
    return removeAlphaComponent(value.getComponents('rgb')).reduce((result, comp) => {
        return (result << 8) | (Math.floor(comp) & 0xff);
    }, 0);
}
function colorToRgbaNumber(value) {
    return (value.getComponents('rgb').reduce((result, comp, index) => {
        const hex = Math.floor(index === 3 ? comp * 255 : comp) & 0xff;
        return (result << 8) | hex;
    }, 0) >>> 0);
}
function numberToRgbColor(num) {
    return new IntColor([(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff], 'rgb');
}
function numberToRgbaColor(num) {
    return new IntColor([
        (num >> 24) & 0xff,
        (num >> 16) & 0xff,
        (num >> 8) & 0xff,
        mapRange(num & 0xff, 0, 255, 0, 1),
    ], 'rgb');
}
function colorFromRgbNumber(value) {
    if (typeof value !== 'number') {
        return IntColor.black();
    }
    return numberToRgbColor(value);
}
function colorFromRgbaNumber(value) {
    if (typeof value !== 'number') {
        return IntColor.black();
    }
    return numberToRgbaColor(value);
}

function isRgbColorComponent(obj, key) {
    if (typeof obj !== 'object' || isEmpty(obj)) {
        return false;
    }
    return key in obj && typeof obj[key] === 'number';
}
function isRgbColorObject(obj) {
    return (isRgbColorComponent(obj, 'r') &&
        isRgbColorComponent(obj, 'g') &&
        isRgbColorComponent(obj, 'b'));
}
function isRgbaColorObject(obj) {
    return isRgbColorObject(obj) && isRgbColorComponent(obj, 'a');
}
function isColorObject(obj) {
    return isRgbColorObject(obj);
}
function equalsColor(v1, v2) {
    if (v1.mode !== v2.mode) {
        return false;
    }
    if (v1.type !== v2.type) {
        return false;
    }
    const comps1 = v1.getComponents();
    const comps2 = v2.getComponents();
    for (let i = 0; i < comps1.length; i++) {
        if (comps1[i] !== comps2[i]) {
            return false;
        }
    }
    return true;
}
function createColorComponentsFromRgbObject(obj) {
    return 'a' in obj ? [obj.r, obj.g, obj.b, obj.a] : [obj.r, obj.g, obj.b];
}

function createColorStringWriter(format) {
    const stringify = findColorStringifier(format);
    return stringify
        ? (target, value) => {
            writePrimitive(target, stringify(value));
        }
        : null;
}
function createColorNumberWriter(supportsAlpha) {
    const colorToNumber = supportsAlpha ? colorToRgbaNumber : colorToRgbNumber;
    return (target, value) => {
        writePrimitive(target, colorToNumber(value));
    };
}
function writeRgbaColorObject(target, value, type) {
    const cc = mapColorType(value, type);
    const obj = cc.toRgbaObject();
    target.writeProperty('r', obj.r);
    target.writeProperty('g', obj.g);
    target.writeProperty('b', obj.b);
    target.writeProperty('a', obj.a);
}
function writeRgbColorObject(target, value, type) {
    const cc = mapColorType(value, type);
    const obj = cc.toRgbaObject();
    target.writeProperty('r', obj.r);
    target.writeProperty('g', obj.g);
    target.writeProperty('b', obj.b);
}
function createColorObjectWriter(supportsAlpha, type) {
    return (target, inValue) => {
        if (supportsAlpha) {
            writeRgbaColorObject(target, inValue, type);
        }
        else {
            writeRgbColorObject(target, inValue, type);
        }
    };
}

function shouldSupportAlpha$1(inputParams) {
    var _a;
    if ((_a = inputParams === null || inputParams === void 0 ? void 0 : inputParams.color) === null || _a === void 0 ? void 0 : _a.alpha) {
        return true;
    }
    return false;
}
function createFormatter$1(supportsAlpha) {
    return supportsAlpha
        ? (v) => colorToHexRgbaString(v, '0x')
        : (v) => colorToHexRgbString(v, '0x');
}
function isForColor(params) {
    if ('color' in params) {
        return true;
    }
    if (params.view === 'color') {
        return true;
    }
    return false;
}
createPlugin({
    id: 'input-color-number',
    type: 'input',
    accept: (value, params) => {
        if (typeof value !== 'number') {
            return null;
        }
        if (!isForColor(params)) {
            return null;
        }
        const result = parseColorInputParams(params);
        return result
            ? {
                initialValue: value,
                params: Object.assign(Object.assign({}, result), { supportsAlpha: shouldSupportAlpha$1(params) }),
            }
            : null;
    },
    binding: {
        reader: (args) => {
            return args.params.supportsAlpha
                ? colorFromRgbaNumber
                : colorFromRgbNumber;
        },
        equals: equalsColor,
        writer: (args) => {
            return createColorNumberWriter(args.params.supportsAlpha);
        },
    },
    controller: (args) => {
        var _a, _b;
        return new ColorController$1(args.document, {
            colorType: 'int',
            expanded: (_a = args.params.expanded) !== null && _a !== void 0 ? _a : false,
            formatter: createFormatter$1(args.params.supportsAlpha),
            parser: createColorStringParser('int'),
            pickerLayout: (_b = args.params.picker) !== null && _b !== void 0 ? _b : 'popup',
            supportsAlpha: args.params.supportsAlpha,
            value: args.value,
            viewProps: args.viewProps,
        });
    },
});

function colorFromObject(value, type) {
    if (!isColorObject(value)) {
        return mapColorType(IntColor.black(), type);
    }
    if (type === 'int') {
        const comps = createColorComponentsFromRgbObject(value);
        return new IntColor(comps, 'rgb');
    }
    if (type === 'float') {
        const comps = createColorComponentsFromRgbObject(value);
        return new FloatColor(comps, 'rgb');
    }
    return mapColorType(IntColor.black(), 'int');
}

function shouldSupportAlpha(initialValue) {
    return isRgbaColorObject(initialValue);
}
function createColorObjectBindingReader(type) {
    return (value) => {
        const c = colorFromObject(value, type);
        return mapColorType(c, 'int');
    };
}
function createColorObjectFormatter(supportsAlpha, type) {
    return (value) => {
        if (supportsAlpha) {
            return colorToObjectRgbaString(value, type);
        }
        return colorToObjectRgbString(value, type);
    };
}
createPlugin({
    id: 'input-color-object',
    type: 'input',
    accept: (value, params) => {
        var _a;
        if (!isColorObject(value)) {
            return null;
        }
        const result = parseColorInputParams(params);
        return result
            ? {
                initialValue: value,
                params: Object.assign(Object.assign({}, result), { colorType: (_a = extractColorType(params)) !== null && _a !== void 0 ? _a : 'int' }),
            }
            : null;
    },
    binding: {
        reader: (args) => createColorObjectBindingReader(args.params.colorType),
        equals: equalsColor,
        writer: (args) => createColorObjectWriter(shouldSupportAlpha(args.initialValue), args.params.colorType),
    },
    controller: (args) => {
        var _a, _b;
        const supportsAlpha = isRgbaColorObject(args.initialValue);
        return new ColorController$1(args.document, {
            colorType: args.params.colorType,
            expanded: (_a = args.params.expanded) !== null && _a !== void 0 ? _a : false,
            formatter: createColorObjectFormatter(supportsAlpha, args.params.colorType),
            parser: createColorStringParser('int'),
            pickerLayout: (_b = args.params.picker) !== null && _b !== void 0 ? _b : 'popup',
            supportsAlpha: supportsAlpha,
            value: args.value,
            viewProps: args.viewProps,
        });
    },
});

createPlugin({
    id: 'input-color-string',
    type: 'input',
    accept: (value, params) => {
        if (typeof value !== 'string') {
            return null;
        }
        if (params.view === 'text') {
            return null;
        }
        const format = detectStringColorFormat(value, extractColorType(params));
        if (!format) {
            return null;
        }
        const stringifier = findColorStringifier(format);
        if (!stringifier) {
            return null;
        }
        const result = parseColorInputParams(params);
        return result
            ? {
                initialValue: value,
                params: Object.assign(Object.assign({}, result), { format: format, stringifier: stringifier }),
            }
            : null;
    },
    binding: {
        reader: () => readIntColorString,
        equals: equalsColor,
        writer: (args) => {
            const writer = createColorStringWriter(args.params.format);
            if (!writer) {
                throw TpError.notBindable();
            }
            return writer;
        },
    },
    controller: (args) => {
        var _a, _b;
        return new ColorController$1(args.document, {
            colorType: args.params.format.type,
            expanded: (_a = args.params.expanded) !== null && _a !== void 0 ? _a : false,
            formatter: args.params.stringifier,
            parser: createColorStringParser('int'),
            pickerLayout: (_b = args.params.picker) !== null && _b !== void 0 ? _b : 'popup',
            supportsAlpha: args.params.format.alpha,
            value: args.value,
            viewProps: args.viewProps,
        });
    },
});

class PointNdConstraint {
    constructor(config) {
        this.components = config.components;
        this.asm_ = config.assembly;
    }
    constrain(value) {
        const comps = this.asm_
            .toComponents(value)
            .map((comp, index) => { var _a, _b; return (_b = (_a = this.components[index]) === null || _a === void 0 ? void 0 : _a.constrain(comp)) !== null && _b !== void 0 ? _b : comp; });
        return this.asm_.fromComponents(comps);
    }
}

const cn$7 = ClassName('pndtxt');
class PointNdTextView {
    constructor(doc, config) {
        this.textViews = config.textViews;
        this.element = doc.createElement('div');
        this.element.classList.add(cn$7());
        this.textViews.forEach((v) => {
            const axisElem = doc.createElement('div');
            axisElem.classList.add(cn$7('a'));
            axisElem.appendChild(v.element);
            this.element.appendChild(axisElem);
        });
    }
}

function createAxisController(doc, config, index) {
    return new NumberTextController(doc, {
        arrayPosition: index === 0 ? 'fst' : index === config.axes.length - 1 ? 'lst' : 'mid',
        parser: config.parser,
        props: config.axes[index].textProps,
        value: createValue(0, {
            constraint: config.axes[index].constraint,
        }),
        viewProps: config.viewProps,
    });
}
class PointNdTextController {
    constructor(doc, config) {
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.acs_ = config.axes.map((_, index) => createAxisController(doc, config, index));
        this.acs_.forEach((c, index) => {
            connectValues({
                primary: this.value,
                secondary: c.value,
                forward: (p) => config.assembly.toComponents(p)[index],
                backward: (p, s) => {
                    const comps = config.assembly.toComponents(p);
                    comps[index] = s;
                    return config.assembly.fromComponents(comps);
                },
            });
        });
        this.view = new PointNdTextView(doc, {
            textViews: this.acs_.map((ac) => ac.view),
        });
    }
    get textControllers() {
        return this.acs_;
    }
}

class SliderInputBindingApi extends BindingApi {
    get max() {
        return this.controller.valueController.sliderController.props.get('max');
    }
    set max(max) {
        this.controller.valueController.sliderController.props.set('max', max);
    }
    get min() {
        return this.controller.valueController.sliderController.props.get('min');
    }
    set min(max) {
        this.controller.valueController.sliderController.props.set('min', max);
    }
}

function createConstraint$4(params, initialValue) {
    const constraints = [];
    const sc = createStepConstraint(params, initialValue);
    if (sc) {
        constraints.push(sc);
    }
    const rc = createRangeConstraint(params);
    if (rc) {
        constraints.push(rc);
    }
    const lc = createListConstraint(params.options);
    if (lc) {
        constraints.push(lc);
    }
    return new CompositeConstraint(constraints);
}
createPlugin({
    id: 'input-number',
    type: 'input',
    accept: (value, params) => {
        if (typeof value !== 'number') {
            return null;
        }
        const result = parseRecord(params, (p) => (Object.assign(Object.assign({}, createNumberTextInputParamsParser(p)), { options: p.optional.custom(parseListOptions), readonly: p.optional.constant(false) })));
        return result
            ? {
                initialValue: value,
                params: result,
            }
            : null;
    },
    binding: {
        reader: (_args) => numberFromUnknown,
        constraint: (args) => createConstraint$4(args.params, args.initialValue),
        writer: (_args) => writePrimitive,
    },
    controller: (args) => {
        const value = args.value;
        const c = args.constraint;
        const lc = c && findConstraint(c, ListConstraint);
        if (lc) {
            return new ListController(args.document, {
                props: new ValueMap({
                    options: lc.values.value('options'),
                }),
                value: value,
                viewProps: args.viewProps,
            });
        }
        const textPropsObj = createNumberTextPropsObject(args.params, value.rawValue);
        const drc = c && findConstraint(c, DefiniteRangeConstraint);
        if (drc) {
            return new SliderTextController(args.document, Object.assign(Object.assign({}, createSliderTextProps(Object.assign(Object.assign({}, textPropsObj), { keyScale: createValue(textPropsObj.keyScale), max: drc.values.value('max'), min: drc.values.value('min') }))), { parser: parseNumber, value: value, viewProps: args.viewProps }));
        }
        return new NumberTextController(args.document, {
            parser: parseNumber,
            props: ValueMap.fromObject(textPropsObj),
            value: value,
            viewProps: args.viewProps,
        });
    },
    api(args) {
        if (typeof args.controller.value.rawValue !== 'number') {
            return null;
        }
        if (args.controller.valueController instanceof SliderTextController) {
            return new SliderInputBindingApi(args.controller);
        }
        if (args.controller.valueController instanceof ListController) {
            return new ListInputBindingApi(args.controller);
        }
        return null;
    },
});

class Point2d {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }
    getComponents() {
        return [this.x, this.y];
    }
    static isObject(obj) {
        if (isEmpty(obj)) {
            return false;
        }
        const x = obj.x;
        const y = obj.y;
        if (typeof x !== 'number' || typeof y !== 'number') {
            return false;
        }
        return true;
    }
    static equals(v1, v2) {
        return v1.x === v2.x && v1.y === v2.y;
    }
    toObject() {
        return {
            x: this.x,
            y: this.y,
        };
    }
}
const Point2dAssembly = {
    toComponents: (p) => p.getComponents(),
    fromComponents: (comps) => new Point2d(...comps),
};

const cn$6 = ClassName('p2d');
class Point2dView {
    constructor(doc, config) {
        this.element = doc.createElement('div');
        this.element.classList.add(cn$6());
        config.viewProps.bindClassModifiers(this.element);
        bindValue(config.expanded, valueToClassName(this.element, cn$6(undefined, 'expanded')));
        const headElem = doc.createElement('div');
        headElem.classList.add(cn$6('h'));
        this.element.appendChild(headElem);
        const buttonElem = doc.createElement('button');
        buttonElem.classList.add(cn$6('b'));
        buttonElem.appendChild(createSvgIconElement(doc, 'p2dpad'));
        config.viewProps.bindDisabled(buttonElem);
        headElem.appendChild(buttonElem);
        this.buttonElement = buttonElem;
        const textElem = doc.createElement('div');
        textElem.classList.add(cn$6('t'));
        headElem.appendChild(textElem);
        this.textElement = textElem;
        if (config.pickerLayout === 'inline') {
            const pickerElem = doc.createElement('div');
            pickerElem.classList.add(cn$6('p'));
            this.element.appendChild(pickerElem);
            this.pickerElement = pickerElem;
        }
        else {
            this.pickerElement = null;
        }
    }
}

const cn$5 = ClassName('p2dp');
class Point2dPickerView {
    constructor(doc, config) {
        this.onFoldableChange_ = this.onFoldableChange_.bind(this);
        this.onPropsChange_ = this.onPropsChange_.bind(this);
        this.onValueChange_ = this.onValueChange_.bind(this);
        this.props_ = config.props;
        this.props_.emitter.on('change', this.onPropsChange_);
        this.element = doc.createElement('div');
        this.element.classList.add(cn$5());
        if (config.layout === 'popup') {
            this.element.classList.add(cn$5(undefined, 'p'));
        }
        config.viewProps.bindClassModifiers(this.element);
        const padElem = doc.createElement('div');
        padElem.classList.add(cn$5('p'));
        config.viewProps.bindTabIndex(padElem);
        this.element.appendChild(padElem);
        this.padElement = padElem;
        const svgElem = doc.createElementNS(SVG_NS, 'svg');
        svgElem.classList.add(cn$5('g'));
        this.padElement.appendChild(svgElem);
        this.svgElem_ = svgElem;
        const xAxisElem = doc.createElementNS(SVG_NS, 'line');
        xAxisElem.classList.add(cn$5('ax'));
        xAxisElem.setAttributeNS(null, 'x1', '0');
        xAxisElem.setAttributeNS(null, 'y1', '50%');
        xAxisElem.setAttributeNS(null, 'x2', '100%');
        xAxisElem.setAttributeNS(null, 'y2', '50%');
        this.svgElem_.appendChild(xAxisElem);
        const yAxisElem = doc.createElementNS(SVG_NS, 'line');
        yAxisElem.classList.add(cn$5('ax'));
        yAxisElem.setAttributeNS(null, 'x1', '50%');
        yAxisElem.setAttributeNS(null, 'y1', '0');
        yAxisElem.setAttributeNS(null, 'x2', '50%');
        yAxisElem.setAttributeNS(null, 'y2', '100%');
        this.svgElem_.appendChild(yAxisElem);
        const lineElem = doc.createElementNS(SVG_NS, 'line');
        lineElem.classList.add(cn$5('l'));
        lineElem.setAttributeNS(null, 'x1', '50%');
        lineElem.setAttributeNS(null, 'y1', '50%');
        this.svgElem_.appendChild(lineElem);
        this.lineElem_ = lineElem;
        const markerElem = doc.createElement('div');
        markerElem.classList.add(cn$5('m'));
        this.padElement.appendChild(markerElem);
        this.markerElem_ = markerElem;
        config.value.emitter.on('change', this.onValueChange_);
        this.value = config.value;
        this.update_();
    }
    get allFocusableElements() {
        return [this.padElement];
    }
    update_() {
        const [x, y] = this.value.rawValue.getComponents();
        const max = this.props_.get('max');
        const px = mapRange(x, -max, +max, 0, 100);
        const py = mapRange(y, -max, +max, 0, 100);
        const ipy = this.props_.get('invertsY') ? 100 - py : py;
        this.lineElem_.setAttributeNS(null, 'x2', `${px}%`);
        this.lineElem_.setAttributeNS(null, 'y2', `${ipy}%`);
        this.markerElem_.style.left = `${px}%`;
        this.markerElem_.style.top = `${ipy}%`;
    }
    onValueChange_() {
        this.update_();
    }
    onPropsChange_() {
        this.update_();
    }
    onFoldableChange_() {
        this.update_();
    }
}

function computeOffset(ev, keyScales, invertsY) {
    return [
        getStepForKey(keyScales[0], getHorizontalStepKeys(ev)),
        getStepForKey(keyScales[1], getVerticalStepKeys(ev)) * (invertsY ? 1 : -1),
    ];
}
class Point2dPickerController {
    constructor(doc, config) {
        this.onPadKeyDown_ = this.onPadKeyDown_.bind(this);
        this.onPadKeyUp_ = this.onPadKeyUp_.bind(this);
        this.onPointerDown_ = this.onPointerDown_.bind(this);
        this.onPointerMove_ = this.onPointerMove_.bind(this);
        this.onPointerUp_ = this.onPointerUp_.bind(this);
        this.props = config.props;
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.view = new Point2dPickerView(doc, {
            layout: config.layout,
            props: this.props,
            value: this.value,
            viewProps: this.viewProps,
        });
        this.ptHandler_ = new PointerHandler(this.view.padElement);
        this.ptHandler_.emitter.on('down', this.onPointerDown_);
        this.ptHandler_.emitter.on('move', this.onPointerMove_);
        this.ptHandler_.emitter.on('up', this.onPointerUp_);
        this.view.padElement.addEventListener('keydown', this.onPadKeyDown_);
        this.view.padElement.addEventListener('keyup', this.onPadKeyUp_);
    }
    handlePointerEvent_(d, opts) {
        if (!d.point) {
            return;
        }
        const max = this.props.get('max');
        const px = mapRange(d.point.x, 0, d.bounds.width, -max, +max);
        const py = mapRange(this.props.get('invertsY') ? d.bounds.height - d.point.y : d.point.y, 0, d.bounds.height, -max, +max);
        this.value.setRawValue(new Point2d(px, py), opts);
    }
    onPointerDown_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: false,
            last: false,
        });
    }
    onPointerMove_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: false,
            last: false,
        });
    }
    onPointerUp_(ev) {
        this.handlePointerEvent_(ev.data, {
            forceEmit: true,
            last: true,
        });
    }
    onPadKeyDown_(ev) {
        if (isArrowKey(ev.key)) {
            ev.preventDefault();
        }
        const [dx, dy] = computeOffset(ev, [this.props.get('xKeyScale'), this.props.get('yKeyScale')], this.props.get('invertsY'));
        if (dx === 0 && dy === 0) {
            return;
        }
        this.value.setRawValue(new Point2d(this.value.rawValue.x + dx, this.value.rawValue.y + dy), {
            forceEmit: false,
            last: false,
        });
    }
    onPadKeyUp_(ev) {
        const [dx, dy] = computeOffset(ev, [this.props.get('xKeyScale'), this.props.get('yKeyScale')], this.props.get('invertsY'));
        if (dx === 0 && dy === 0) {
            return;
        }
        this.value.setRawValue(this.value.rawValue, {
            forceEmit: true,
            last: true,
        });
    }
}

class Point2dController {
    constructor(doc, config) {
        var _a, _b;
        this.onPopupChildBlur_ = this.onPopupChildBlur_.bind(this);
        this.onPopupChildKeydown_ = this.onPopupChildKeydown_.bind(this);
        this.onPadButtonBlur_ = this.onPadButtonBlur_.bind(this);
        this.onPadButtonClick_ = this.onPadButtonClick_.bind(this);
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.foldable_ = Foldable.create(config.expanded);
        this.popC_ =
            config.pickerLayout === 'popup'
                ? new PopupController(doc, {
                    viewProps: this.viewProps,
                })
                : null;
        const padC = new Point2dPickerController(doc, {
            layout: config.pickerLayout,
            props: new ValueMap({
                invertsY: createValue(config.invertsY),
                max: createValue(config.max),
                xKeyScale: config.axes[0].textProps.value('keyScale'),
                yKeyScale: config.axes[1].textProps.value('keyScale'),
            }),
            value: this.value,
            viewProps: this.viewProps,
        });
        padC.view.allFocusableElements.forEach((elem) => {
            elem.addEventListener('blur', this.onPopupChildBlur_);
            elem.addEventListener('keydown', this.onPopupChildKeydown_);
        });
        this.pickerC_ = padC;
        this.textC_ = new PointNdTextController(doc, {
            assembly: Point2dAssembly,
            axes: config.axes,
            parser: config.parser,
            value: this.value,
            viewProps: this.viewProps,
        });
        this.view = new Point2dView(doc, {
            expanded: this.foldable_.value('expanded'),
            pickerLayout: config.pickerLayout,
            viewProps: this.viewProps,
        });
        this.view.textElement.appendChild(this.textC_.view.element);
        (_a = this.view.buttonElement) === null || _a === void 0 ? void 0 : _a.addEventListener('blur', this.onPadButtonBlur_);
        (_b = this.view.buttonElement) === null || _b === void 0 ? void 0 : _b.addEventListener('click', this.onPadButtonClick_);
        if (this.popC_) {
            this.view.element.appendChild(this.popC_.view.element);
            this.popC_.view.element.appendChild(this.pickerC_.view.element);
            connectValues({
                primary: this.foldable_.value('expanded'),
                secondary: this.popC_.shows,
                forward: (p) => p,
                backward: (_, s) => s,
            });
        }
        else if (this.view.pickerElement) {
            this.view.pickerElement.appendChild(this.pickerC_.view.element);
            bindFoldable(this.foldable_, this.view.pickerElement);
        }
    }
    get textController() {
        return this.textC_;
    }
    onPadButtonBlur_(e) {
        if (!this.popC_) {
            return;
        }
        const elem = this.view.element;
        const nextTarget = forceCast(e.relatedTarget);
        if (!nextTarget || !elem.contains(nextTarget)) {
            this.popC_.shows.rawValue = false;
        }
    }
    onPadButtonClick_() {
        this.foldable_.set('expanded', !this.foldable_.get('expanded'));
        if (this.foldable_.get('expanded')) {
            this.pickerC_.view.allFocusableElements[0].focus();
        }
    }
    onPopupChildBlur_(ev) {
        if (!this.popC_) {
            return;
        }
        const elem = this.popC_.view.element;
        const nextTarget = findNextTarget(ev);
        if (nextTarget && elem.contains(nextTarget)) {
            return;
        }
        if (nextTarget &&
            nextTarget === this.view.buttonElement &&
            !supportsTouch(elem.ownerDocument)) {
            return;
        }
        this.popC_.shows.rawValue = false;
    }
    onPopupChildKeydown_(ev) {
        if (this.popC_) {
            if (ev.key === 'Escape') {
                this.popC_.shows.rawValue = false;
            }
        }
        else if (this.view.pickerElement) {
            if (ev.key === 'Escape') {
                this.view.buttonElement.focus();
            }
        }
    }
}

function point2dFromUnknown(value) {
    return Point2d.isObject(value)
        ? new Point2d(value.x, value.y)
        : new Point2d();
}
function writePoint2d(target, value) {
    target.writeProperty('x', value.x);
    target.writeProperty('y', value.y);
}

function createConstraint$3(params, initialValue) {
    return new PointNdConstraint({
        assembly: Point2dAssembly,
        components: [
            createDimensionConstraint(Object.assign(Object.assign({}, params), params.x), initialValue.x),
            createDimensionConstraint(Object.assign(Object.assign({}, params), params.y), initialValue.y),
        ],
    });
}
function getSuitableMaxDimensionValue(params, rawValue) {
    var _a, _b;
    if (!isEmpty(params.min) || !isEmpty(params.max)) {
        return Math.max(Math.abs((_a = params.min) !== null && _a !== void 0 ? _a : 0), Math.abs((_b = params.max) !== null && _b !== void 0 ? _b : 0));
    }
    const step = getSuitableKeyScale(params);
    return Math.max(Math.abs(step) * 10, Math.abs(rawValue) * 10);
}
function getSuitableMax(params, initialValue) {
    var _a, _b;
    const xr = getSuitableMaxDimensionValue(deepMerge(params, ((_a = params.x) !== null && _a !== void 0 ? _a : {})), initialValue.x);
    const yr = getSuitableMaxDimensionValue(deepMerge(params, ((_b = params.y) !== null && _b !== void 0 ? _b : {})), initialValue.y);
    return Math.max(xr, yr);
}
function shouldInvertY(params) {
    if (!('y' in params)) {
        return false;
    }
    const yParams = params.y;
    if (!yParams) {
        return false;
    }
    return 'inverted' in yParams ? !!yParams.inverted : false;
}
createPlugin({
    id: 'input-point2d',
    type: 'input',
    accept: (value, params) => {
        if (!Point2d.isObject(value)) {
            return null;
        }
        const result = parseRecord(params, (p) => (Object.assign(Object.assign({}, createPointDimensionParser(p)), { expanded: p.optional.boolean, picker: p.optional.custom(parsePickerLayout), readonly: p.optional.constant(false), x: p.optional.custom(parsePointDimensionParams), y: p.optional.object(Object.assign(Object.assign({}, createPointDimensionParser(p)), { inverted: p.optional.boolean })) })));
        return result
            ? {
                initialValue: value,
                params: result,
            }
            : null;
    },
    binding: {
        reader: () => point2dFromUnknown,
        constraint: (args) => createConstraint$3(args.params, args.initialValue),
        equals: Point2d.equals,
        writer: () => writePoint2d,
    },
    controller: (args) => {
        var _a, _b;
        const doc = args.document;
        const value = args.value;
        const c = args.constraint;
        const dParams = [args.params.x, args.params.y];
        return new Point2dController(doc, {
            axes: value.rawValue.getComponents().map((comp, i) => {
                var _a;
                return createPointAxis({
                    constraint: c.components[i],
                    initialValue: comp,
                    params: deepMerge(args.params, ((_a = dParams[i]) !== null && _a !== void 0 ? _a : {})),
                });
            }),
            expanded: (_a = args.params.expanded) !== null && _a !== void 0 ? _a : false,
            invertsY: shouldInvertY(args.params),
            max: getSuitableMax(args.params, value.rawValue),
            parser: parseNumber,
            pickerLayout: (_b = args.params.picker) !== null && _b !== void 0 ? _b : 'popup',
            value: value,
            viewProps: args.viewProps,
        });
    },
});

class Point3d {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
    getComponents() {
        return [this.x, this.y, this.z];
    }
    static isObject(obj) {
        if (isEmpty(obj)) {
            return false;
        }
        const x = obj.x;
        const y = obj.y;
        const z = obj.z;
        if (typeof x !== 'number' ||
            typeof y !== 'number' ||
            typeof z !== 'number') {
            return false;
        }
        return true;
    }
    static equals(v1, v2) {
        return v1.x === v2.x && v1.y === v2.y && v1.z === v2.z;
    }
    toObject() {
        return {
            x: this.x,
            y: this.y,
            z: this.z,
        };
    }
}
const Point3dAssembly = {
    toComponents: (p) => p.getComponents(),
    fromComponents: (comps) => new Point3d(...comps),
};

function point3dFromUnknown(value) {
    return Point3d.isObject(value)
        ? new Point3d(value.x, value.y, value.z)
        : new Point3d();
}
function writePoint3d(target, value) {
    target.writeProperty('x', value.x);
    target.writeProperty('y', value.y);
    target.writeProperty('z', value.z);
}

function createConstraint$2(params, initialValue) {
    return new PointNdConstraint({
        assembly: Point3dAssembly,
        components: [
            createDimensionConstraint(Object.assign(Object.assign({}, params), params.x), initialValue.x),
            createDimensionConstraint(Object.assign(Object.assign({}, params), params.y), initialValue.y),
            createDimensionConstraint(Object.assign(Object.assign({}, params), params.z), initialValue.z),
        ],
    });
}
createPlugin({
    id: 'input-point3d',
    type: 'input',
    accept: (value, params) => {
        if (!Point3d.isObject(value)) {
            return null;
        }
        const result = parseRecord(params, (p) => (Object.assign(Object.assign({}, createPointDimensionParser(p)), { readonly: p.optional.constant(false), x: p.optional.custom(parsePointDimensionParams), y: p.optional.custom(parsePointDimensionParams), z: p.optional.custom(parsePointDimensionParams) })));
        return result
            ? {
                initialValue: value,
                params: result,
            }
            : null;
    },
    binding: {
        reader: (_args) => point3dFromUnknown,
        constraint: (args) => createConstraint$2(args.params, args.initialValue),
        equals: Point3d.equals,
        writer: (_args) => writePoint3d,
    },
    controller: (args) => {
        const value = args.value;
        const c = args.constraint;
        const dParams = [args.params.x, args.params.y, args.params.z];
        return new PointNdTextController(args.document, {
            assembly: Point3dAssembly,
            axes: value.rawValue.getComponents().map((comp, i) => {
                var _a;
                return createPointAxis({
                    constraint: c.components[i],
                    initialValue: comp,
                    params: deepMerge(args.params, ((_a = dParams[i]) !== null && _a !== void 0 ? _a : {})),
                });
            }),
            parser: parseNumber,
            value: value,
            viewProps: args.viewProps,
        });
    },
});

class Point4d {
    constructor(x = 0, y = 0, z = 0, w = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
    }
    getComponents() {
        return [this.x, this.y, this.z, this.w];
    }
    static isObject(obj) {
        if (isEmpty(obj)) {
            return false;
        }
        const x = obj.x;
        const y = obj.y;
        const z = obj.z;
        const w = obj.w;
        if (typeof x !== 'number' ||
            typeof y !== 'number' ||
            typeof z !== 'number' ||
            typeof w !== 'number') {
            return false;
        }
        return true;
    }
    static equals(v1, v2) {
        return v1.x === v2.x && v1.y === v2.y && v1.z === v2.z && v1.w === v2.w;
    }
    toObject() {
        return {
            x: this.x,
            y: this.y,
            z: this.z,
            w: this.w,
        };
    }
}
const Point4dAssembly = {
    toComponents: (p) => p.getComponents(),
    fromComponents: (comps) => new Point4d(...comps),
};

function point4dFromUnknown(value) {
    return Point4d.isObject(value)
        ? new Point4d(value.x, value.y, value.z, value.w)
        : new Point4d();
}
function writePoint4d(target, value) {
    target.writeProperty('x', value.x);
    target.writeProperty('y', value.y);
    target.writeProperty('z', value.z);
    target.writeProperty('w', value.w);
}

function createConstraint$1(params, initialValue) {
    return new PointNdConstraint({
        assembly: Point4dAssembly,
        components: [
            createDimensionConstraint(Object.assign(Object.assign({}, params), params.x), initialValue.x),
            createDimensionConstraint(Object.assign(Object.assign({}, params), params.y), initialValue.y),
            createDimensionConstraint(Object.assign(Object.assign({}, params), params.z), initialValue.z),
            createDimensionConstraint(Object.assign(Object.assign({}, params), params.w), initialValue.w),
        ],
    });
}
createPlugin({
    id: 'input-point4d',
    type: 'input',
    accept: (value, params) => {
        if (!Point4d.isObject(value)) {
            return null;
        }
        const result = parseRecord(params, (p) => (Object.assign(Object.assign({}, createPointDimensionParser(p)), { readonly: p.optional.constant(false), w: p.optional.custom(parsePointDimensionParams), x: p.optional.custom(parsePointDimensionParams), y: p.optional.custom(parsePointDimensionParams), z: p.optional.custom(parsePointDimensionParams) })));
        return result
            ? {
                initialValue: value,
                params: result,
            }
            : null;
    },
    binding: {
        reader: (_args) => point4dFromUnknown,
        constraint: (args) => createConstraint$1(args.params, args.initialValue),
        equals: Point4d.equals,
        writer: (_args) => writePoint4d,
    },
    controller: (args) => {
        const value = args.value;
        const c = args.constraint;
        const dParams = [
            args.params.x,
            args.params.y,
            args.params.z,
            args.params.w,
        ];
        return new PointNdTextController(args.document, {
            assembly: Point4dAssembly,
            axes: value.rawValue.getComponents().map((comp, i) => {
                var _a;
                return createPointAxis({
                    constraint: c.components[i],
                    initialValue: comp,
                    params: deepMerge(args.params, ((_a = dParams[i]) !== null && _a !== void 0 ? _a : {})),
                });
            }),
            parser: parseNumber,
            value: value,
            viewProps: args.viewProps,
        });
    },
});

function createConstraint(params) {
    const constraints = [];
    const lc = createListConstraint(params.options);
    if (lc) {
        constraints.push(lc);
    }
    return new CompositeConstraint(constraints);
}
createPlugin({
    id: 'input-string',
    type: 'input',
    accept: (value, params) => {
        if (typeof value !== 'string') {
            return null;
        }
        const result = parseRecord(params, (p) => ({
            readonly: p.optional.constant(false),
            options: p.optional.custom(parseListOptions),
        }));
        return result
            ? {
                initialValue: value,
                params: result,
            }
            : null;
    },
    binding: {
        reader: (_args) => stringFromUnknown,
        constraint: (args) => createConstraint(args.params),
        writer: (_args) => writePrimitive,
    },
    controller: (args) => {
        const doc = args.document;
        const value = args.value;
        const c = args.constraint;
        const lc = c && findConstraint(c, ListConstraint);
        if (lc) {
            return new ListController(doc, {
                props: new ValueMap({
                    options: lc.values.value('options'),
                }),
                value: value,
                viewProps: args.viewProps,
            });
        }
        return new TextController(doc, {
            parser: (v) => v,
            props: ValueMap.fromObject({
                formatter: formatString,
            }),
            value: value,
            viewProps: args.viewProps,
        });
    },
    api(args) {
        if (typeof args.controller.value.rawValue !== 'string') {
            return null;
        }
        if (args.controller.valueController instanceof ListController) {
            return new ListInputBindingApi(args.controller);
        }
        return null;
    },
});

const Constants = {
    monitor: {
        defaultInterval: 200,
        defaultRows: 3,
    },
};

const cn$4 = ClassName('mll');
class MultiLogView {
    constructor(doc, config) {
        this.onValueUpdate_ = this.onValueUpdate_.bind(this);
        this.formatter_ = config.formatter;
        this.element = doc.createElement('div');
        this.element.classList.add(cn$4());
        config.viewProps.bindClassModifiers(this.element);
        const textareaElem = doc.createElement('textarea');
        textareaElem.classList.add(cn$4('i'));
        textareaElem.style.height = `calc(var(${getCssVar('containerUnitSize')}) * ${config.rows})`;
        textareaElem.readOnly = true;
        config.viewProps.bindDisabled(textareaElem);
        this.element.appendChild(textareaElem);
        this.textareaElem_ = textareaElem;
        config.value.emitter.on('change', this.onValueUpdate_);
        this.value = config.value;
        this.update_();
    }
    update_() {
        const elem = this.textareaElem_;
        const shouldScroll = elem.scrollTop === elem.scrollHeight - elem.clientHeight;
        const lines = [];
        this.value.rawValue.forEach((value) => {
            if (value !== undefined) {
                lines.push(this.formatter_(value));
            }
        });
        elem.textContent = lines.join('\n');
        if (shouldScroll) {
            elem.scrollTop = elem.scrollHeight;
        }
    }
    onValueUpdate_() {
        this.update_();
    }
}

class MultiLogController {
    constructor(doc, config) {
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.view = new MultiLogView(doc, {
            formatter: config.formatter,
            rows: config.rows,
            value: this.value,
            viewProps: this.viewProps,
        });
    }
}

const cn$3 = ClassName('sgl');
class SingleLogView {
    constructor(doc, config) {
        this.onValueUpdate_ = this.onValueUpdate_.bind(this);
        this.formatter_ = config.formatter;
        this.element = doc.createElement('div');
        this.element.classList.add(cn$3());
        config.viewProps.bindClassModifiers(this.element);
        const inputElem = doc.createElement('input');
        inputElem.classList.add(cn$3('i'));
        inputElem.readOnly = true;
        inputElem.type = 'text';
        config.viewProps.bindDisabled(inputElem);
        this.element.appendChild(inputElem);
        this.inputElement = inputElem;
        config.value.emitter.on('change', this.onValueUpdate_);
        this.value = config.value;
        this.update_();
    }
    update_() {
        const values = this.value.rawValue;
        const lastValue = values[values.length - 1];
        this.inputElement.value =
            lastValue !== undefined ? this.formatter_(lastValue) : '';
    }
    onValueUpdate_() {
        this.update_();
    }
}

class SingleLogController {
    constructor(doc, config) {
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.view = new SingleLogView(doc, {
            formatter: config.formatter,
            value: this.value,
            viewProps: this.viewProps,
        });
    }
}

createPlugin({
    id: 'monitor-bool',
    type: 'monitor',
    accept: (value, params) => {
        if (typeof value !== 'boolean') {
            return null;
        }
        const result = parseRecord(params, (p) => ({
            readonly: p.required.constant(true),
            rows: p.optional.number,
        }));
        return result
            ? {
                initialValue: value,
                params: result,
            }
            : null;
    },
    binding: {
        reader: (_args) => boolFromUnknown,
    },
    controller: (args) => {
        var _a;
        if (args.value.rawValue.length === 1) {
            return new SingleLogController(args.document, {
                formatter: BooleanFormatter,
                value: args.value,
                viewProps: args.viewProps,
            });
        }
        return new MultiLogController(args.document, {
            formatter: BooleanFormatter,
            rows: (_a = args.params.rows) !== null && _a !== void 0 ? _a : Constants.monitor.defaultRows,
            value: args.value,
            viewProps: args.viewProps,
        });
    },
});

class GraphLogMonitorBindingApi extends BindingApi {
    get max() {
        return this.controller.valueController.props.get('max');
    }
    set max(max) {
        this.controller.valueController.props.set('max', max);
    }
    get min() {
        return this.controller.valueController.props.get('min');
    }
    set min(min) {
        this.controller.valueController.props.set('min', min);
    }
}

const cn$2 = ClassName('grl');
class GraphLogView {
    constructor(doc, config) {
        this.onCursorChange_ = this.onCursorChange_.bind(this);
        this.onValueUpdate_ = this.onValueUpdate_.bind(this);
        this.element = doc.createElement('div');
        this.element.classList.add(cn$2());
        config.viewProps.bindClassModifiers(this.element);
        this.formatter_ = config.formatter;
        this.props_ = config.props;
        this.cursor_ = config.cursor;
        this.cursor_.emitter.on('change', this.onCursorChange_);
        const svgElem = doc.createElementNS(SVG_NS, 'svg');
        svgElem.classList.add(cn$2('g'));
        svgElem.style.height = `calc(var(${getCssVar('containerUnitSize')}) * ${config.rows})`;
        this.element.appendChild(svgElem);
        this.svgElem_ = svgElem;
        const lineElem = doc.createElementNS(SVG_NS, 'polyline');
        this.svgElem_.appendChild(lineElem);
        this.lineElem_ = lineElem;
        const tooltipElem = doc.createElement('div');
        tooltipElem.classList.add(cn$2('t'), ClassName('tt')());
        this.element.appendChild(tooltipElem);
        this.tooltipElem_ = tooltipElem;
        config.value.emitter.on('change', this.onValueUpdate_);
        this.value = config.value;
        this.update_();
    }
    get graphElement() {
        return this.svgElem_;
    }
    update_() {
        const { clientWidth: w, clientHeight: h } = this.element;
        const maxIndex = this.value.rawValue.length - 1;
        const min = this.props_.get('min');
        const max = this.props_.get('max');
        const points = [];
        this.value.rawValue.forEach((v, index) => {
            if (v === undefined) {
                return;
            }
            const x = mapRange(index, 0, maxIndex, 0, w);
            const y = mapRange(v, min, max, h, 0);
            points.push([x, y].join(','));
        });
        this.lineElem_.setAttributeNS(null, 'points', points.join(' '));
        const tooltipElem = this.tooltipElem_;
        const value = this.value.rawValue[this.cursor_.rawValue];
        if (value === undefined) {
            tooltipElem.classList.remove(cn$2('t', 'a'));
            return;
        }
        const tx = mapRange(this.cursor_.rawValue, 0, maxIndex, 0, w);
        const ty = mapRange(value, min, max, h, 0);
        tooltipElem.style.left = `${tx}px`;
        tooltipElem.style.top = `${ty}px`;
        tooltipElem.textContent = `${this.formatter_(value)}`;
        if (!tooltipElem.classList.contains(cn$2('t', 'a'))) {
            tooltipElem.classList.add(cn$2('t', 'a'), cn$2('t', 'in'));
            forceReflow(tooltipElem);
            tooltipElem.classList.remove(cn$2('t', 'in'));
        }
    }
    onValueUpdate_() {
        this.update_();
    }
    onCursorChange_() {
        this.update_();
    }
}

class GraphLogController {
    constructor(doc, config) {
        this.onGraphMouseMove_ = this.onGraphMouseMove_.bind(this);
        this.onGraphMouseLeave_ = this.onGraphMouseLeave_.bind(this);
        this.onGraphPointerDown_ = this.onGraphPointerDown_.bind(this);
        this.onGraphPointerMove_ = this.onGraphPointerMove_.bind(this);
        this.onGraphPointerUp_ = this.onGraphPointerUp_.bind(this);
        this.props = config.props;
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.cursor_ = createValue(-1);
        this.view = new GraphLogView(doc, {
            cursor: this.cursor_,
            formatter: config.formatter,
            rows: config.rows,
            props: this.props,
            value: this.value,
            viewProps: this.viewProps,
        });
        if (!supportsTouch(doc)) {
            this.view.element.addEventListener('mousemove', this.onGraphMouseMove_);
            this.view.element.addEventListener('mouseleave', this.onGraphMouseLeave_);
        }
        else {
            const ph = new PointerHandler(this.view.element);
            ph.emitter.on('down', this.onGraphPointerDown_);
            ph.emitter.on('move', this.onGraphPointerMove_);
            ph.emitter.on('up', this.onGraphPointerUp_);
        }
    }
    importProps(state) {
        return importBladeState(state, null, (p) => ({
            max: p.required.number,
            min: p.required.number,
        }), (result) => {
            this.props.set('max', result.max);
            this.props.set('min', result.min);
            return true;
        });
    }
    exportProps() {
        return exportBladeState(null, {
            max: this.props.get('max'),
            min: this.props.get('min'),
        });
    }
    onGraphMouseLeave_() {
        this.cursor_.rawValue = -1;
    }
    onGraphMouseMove_(ev) {
        const { clientWidth: w } = this.view.element;
        this.cursor_.rawValue = Math.floor(mapRange(ev.offsetX, 0, w, 0, this.value.rawValue.length));
    }
    onGraphPointerDown_(ev) {
        this.onGraphPointerMove_(ev);
    }
    onGraphPointerMove_(ev) {
        if (!ev.data.point) {
            this.cursor_.rawValue = -1;
            return;
        }
        this.cursor_.rawValue = Math.floor(mapRange(ev.data.point.x, 0, ev.data.bounds.width, 0, this.value.rawValue.length));
    }
    onGraphPointerUp_() {
        this.cursor_.rawValue = -1;
    }
}

function createFormatter(params) {
    return !isEmpty(params.format) ? params.format : createNumberFormatter(2);
}
function createTextMonitor(args) {
    var _a;
    if (args.value.rawValue.length === 1) {
        return new SingleLogController(args.document, {
            formatter: createFormatter(args.params),
            value: args.value,
            viewProps: args.viewProps,
        });
    }
    return new MultiLogController(args.document, {
        formatter: createFormatter(args.params),
        rows: (_a = args.params.rows) !== null && _a !== void 0 ? _a : Constants.monitor.defaultRows,
        value: args.value,
        viewProps: args.viewProps,
    });
}
function createGraphMonitor(args) {
    var _a, _b, _c;
    return new GraphLogController(args.document, {
        formatter: createFormatter(args.params),
        rows: (_a = args.params.rows) !== null && _a !== void 0 ? _a : Constants.monitor.defaultRows,
        props: ValueMap.fromObject({
            max: (_b = args.params.max) !== null && _b !== void 0 ? _b : 100,
            min: (_c = args.params.min) !== null && _c !== void 0 ? _c : 0,
        }),
        value: args.value,
        viewProps: args.viewProps,
    });
}
function shouldShowGraph(params) {
    return params.view === 'graph';
}
createPlugin({
    id: 'monitor-number',
    type: 'monitor',
    accept: (value, params) => {
        if (typeof value !== 'number') {
            return null;
        }
        const result = parseRecord(params, (p) => ({
            format: p.optional.function,
            max: p.optional.number,
            min: p.optional.number,
            readonly: p.required.constant(true),
            rows: p.optional.number,
            view: p.optional.string,
        }));
        return result
            ? {
                initialValue: value,
                params: result,
            }
            : null;
    },
    binding: {
        defaultBufferSize: (params) => (shouldShowGraph(params) ? 64 : 1),
        reader: (_args) => numberFromUnknown,
    },
    controller: (args) => {
        if (shouldShowGraph(args.params)) {
            return createGraphMonitor(args);
        }
        return createTextMonitor(args);
    },
    api: (args) => {
        if (args.controller.valueController instanceof GraphLogController) {
            return new GraphLogMonitorBindingApi(args.controller);
        }
        return null;
    },
});

createPlugin({
    id: 'monitor-string',
    type: 'monitor',
    accept: (value, params) => {
        if (typeof value !== 'string') {
            return null;
        }
        const result = parseRecord(params, (p) => ({
            multiline: p.optional.boolean,
            readonly: p.required.constant(true),
            rows: p.optional.number,
        }));
        return result
            ? {
                initialValue: value,
                params: result,
            }
            : null;
    },
    binding: {
        reader: (_args) => stringFromUnknown,
    },
    controller: (args) => {
        var _a;
        const value = args.value;
        const multiline = value.rawValue.length > 1 || args.params.multiline;
        if (multiline) {
            return new MultiLogController(args.document, {
                formatter: formatString,
                rows: (_a = args.params.rows) !== null && _a !== void 0 ? _a : Constants.monitor.defaultRows,
                value: value,
                viewProps: args.viewProps,
            });
        }
        return new SingleLogController(args.document, {
            formatter: formatString,
            value: value,
            viewProps: args.viewProps,
        });
    },
});

/*
 * Colour-space conversions — the maths backbone of the picker.
 *
 * Every conversion hubs through CIE XYZ. sRGB / Display-P3 / Rec2020 are D65;
 * Lab / LCH / ProPhoto are D50 and cross to D65 via a Bradford adaptation.
 * OKLab/OKLCH use Björn Ottosson's matrices (D65). The matrix and
 * transfer-function constants are the CSS Color 4 reference values
 * (https://www.w3.org/TR/css-color-4/), so results match colorjs.io to within
 * ~1e-12 — the parity tests in test/ gate on exactly that.
 *
 * Conventions (matching colorjs.io coords, so the model can pass ids straight
 * through): hues are degrees; RGB-family channels 0..1; OKLab/OKLCH L is 0..1;
 * Lab/LCH L is 0..100; HSL S/L and HWB W/B are 0..100.
 */
const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;
/** 3×3 matrix × 3-vector. */
function mul(m, v) {
    return [
        m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
        m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
        m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
    ];
}
/** 3×3 × 3×3 matrix product — used to fuse a fixed conversion chain into one
 *  matrix ahead of a hot loop. */
function mulMat(a, b) {
    const o = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
    ];
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            o[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
        }
    }
    return o;
}
// ── Transfer functions (gamma ↔ linear), all sign-preserving per CSS Color 4 ──
/** sRGB / Display-P3 gamma → linear-light. */
function srgbLin(c) {
    const a = Math.abs(c);
    return a <= 0.04045 ? c / 12.92 : Math.sign(c) * ((a + 0.055) / 1.055) ** 2.4;
}
/** Linear-light → sRGB / Display-P3 gamma. */
function srgbGam(c) {
    const a = Math.abs(c);
    return a <= 0.0031308
        ? c * 12.92
        : Math.sign(c) * (1.055 * a ** (1 / 2.4) - 0.055);
}
// colorjs.io 0.6 models Rec2020 with a plain 2.4 gamma (no linear toe / α-β
// OETF). We match that exactly so rec2020 values stay identical to what the
// plugin ships today; see the parity tests. (A spec-correct OETF would differ
// slightly near black — a deliberate change we've chosen not to make here.)
function rec2020Lin(c) {
    return Math.sign(c) * Math.abs(c) ** 2.4;
}
function rec2020Gam(c) {
    return Math.sign(c) * Math.abs(c) ** (1 / 2.4);
}
const PRO_ET = 1 / 512;
function prophotoLin(c) {
    const a = Math.abs(c);
    return a <= PRO_ET * 16 ? c / 16 : Math.sign(c) * a ** 1.8;
}
function prophotoGam(c) {
    const a = Math.abs(c);
    return a >= PRO_ET ? Math.sign(c) * a ** (1 / 1.8) : 16 * c;
}
// ── Matrices: linear RGB ↔ XYZ (D65 unless noted), Bradford, OKLab ───────────
const LIN_SRGB_TO_XYZ = [
    [0.41239079926595934, 0.357584339383878, 0.1804807884018343],
    [0.21263900587151027, 0.715168678767756, 0.07219231536073371],
    [0.01933081871559182, 0.11919477979462598, 0.9505321522496607],
];
const XYZ_TO_LIN_SRGB = [
    [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
    [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
    [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];
const LIN_P3_TO_XYZ = [
    [0.4865709486482162, 0.26566769316909306, 0.19821728523436247],
    [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
    [0, 0.04511338185890264, 1.043944368900976],
];
const XYZ_TO_LIN_P3 = [
    [2.493496911941425, -0.9313836179191239, -0.40271078445071684],
    [-0.8294889695615747, 1.7626640603183463, 0.023624685841943577],
    [0.03584583024378447, -0.07617238926804182, 0.9568845240076872],
];
const LIN_REC2020_TO_XYZ = [
    [0.6369580483012914, 0.14461690358620832, 0.16888097516417205],
    [0.2627002120112671, 0.6779980715188708, 0.05930171646986196],
    [0, 0.028072693049087428, 1.060985057710791],
];
const XYZ_TO_LIN_REC2020 = [
    [1.7166511879712674, -0.35567078377639233, -0.25336628137365974],
    [-0.6666843518324892, 1.6164812366349395, 0.01576854581391113],
    [0.017639857445310783, -0.042770613257808524, 0.9421031212354738],
];
// ProPhoto is D50-referenced.
const LIN_PRO_TO_XYZ_D50 = [
    [0.7977604896723027, 0.13518583717574031, 0.0313493495815248],
    [0.2880711282292934, 0.7118432178101014, 0.00008565396060525902],
    [0, 0, 0.8251046025104601],
];
const XYZ_D50_TO_LIN_PRO = [
    [1.3457989731028281, -0.25558010007997534, -0.05110628506753401],
    [-0.5446224939028347, 1.5082327413132781, 0.02053603239147973],
    [0, 0, 1.2119675456389454],
];
// Bradford-adapted XYZ white-point conversion.
const XYZ_D65_TO_D50 = [
    [1.0479298208405488, 0.022946793341019088, -0.05019222954313557],
    [0.029627815688159344, 0.990434484573249, -0.01707382502938514],
    [-0.009243058152591178, 0.015055144896577895, 0.7518742899580008],
];
const XYZ_D50_TO_D65 = [
    [0.9554734527042182, -0.023098536874261423, 0.0632593086610217],
    [-0.028369706963208136, 1.0099954580058226, 0.021041398966943008],
    [0.012314001688319899, -0.020507696433477912, 1.3303659366080753],
];
// OKLab (Ottosson), referenced to XYZ-D65.
const XYZ_TO_LMS = [
    [0.819022437996703, 0.3619062600528904, -0.1288737815209879],
    [0.0329836539323885, 0.9292868615863434, 0.0361446663506424],
    [0.0481771893596242, 0.2642395317527308, 0.6335478284694309],
];
const LMS_TO_XYZ = [
    [1.2268798758459243, -0.5578149944602171, 0.2813910456659647],
    [-0.0405757452148008, 1.112286803280317, -0.0717110580655164],
    [-0.0763729366746601, -0.4214933324022432, 1.5869240198367816],
];
const LMS_TO_OKLAB = [
    [0.210454268309314, 0.7936177747023054, -0.0040720430116193],
    [1.9779985324311684, -2.42859224204858, 0.450593709617411],
    [0.0259040424655478, 0.7827717124575296, -0.8086757549230774],
];
const OKLAB_TO_LMS = [
    [1.0, 0.3963377773761749, 0.2158037573099136],
    [1.0, -0.1055613458156586, -0.0638541728258133],
    [1.0, -0.0894841775298119, -1.2914855480194092],
];
// CIE Lab (D50).
const LAB_E = 216 / 24389;
const LAB_K = 24389 / 27;
const WHITE_D50 = [
    0.3457 / 0.3585,
    1.0,
    (1.0 - 0.3457 - 0.3585) / 0.3585,
];
// ── Space ↔ XYZ-D65 (the hub) ────────────────────────────────────────────────
function rgbToXyz(c, lin, m) {
    return mul(m, [lin(c[0]), lin(c[1]), lin(c[2])]);
}
function xyzToRgb(xyz, gam, m) {
    const l = mul(m, xyz);
    return [gam(l[0]), gam(l[1]), gam(l[2])];
}
function oklabToXyz(lab) {
    const p = mul(OKLAB_TO_LMS, lab);
    return mul(LMS_TO_XYZ, [p[0] ** 3, p[1] ** 3, p[2] ** 3]);
}
function xyzToOklab(xyz) {
    const lms = mul(XYZ_TO_LMS, xyz);
    return mul(LMS_TO_OKLAB, [
        Math.cbrt(lms[0]),
        Math.cbrt(lms[1]),
        Math.cbrt(lms[2]),
    ]);
}
function labToXyz(lab) {
    const [L, a, b] = lab;
    const fy = (L + 16) / 116;
    const fx = a / 500 + fy;
    const fz = fy - b / 200;
    const x = fx ** 3 > LAB_E ? fx ** 3 : (116 * fx - 16) / LAB_K;
    const y = L > LAB_K * LAB_E ? fy ** 3 : L / LAB_K;
    const z = fz ** 3 > LAB_E ? fz ** 3 : (116 * fz - 16) / LAB_K;
    return mul(XYZ_D50_TO_D65, [
        x * WHITE_D50[0],
        y * WHITE_D50[1],
        z * WHITE_D50[2],
    ]);
}
function xyzToLab(xyz) {
    const d50 = mul(XYZ_D65_TO_D50, xyz);
    const f = (t) => t > LAB_E ? Math.cbrt(t) : (LAB_K * t + 16) / 116;
    const fx = f(d50[0] / WHITE_D50[0]);
    const fy = f(d50[1] / WHITE_D50[1]);
    const fz = f(d50[2] / WHITE_D50[2]);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
/** Rectangular → polar on channels [1],[2] (Lab→LCH, OKLab→OKLCH). Hue in deg. */
function toPolar(rect) {
    const C = Math.hypot(rect[1], rect[2]);
    let h = Math.atan2(rect[2], rect[1]) * DEG;
    if (h < 0)
        h += 360;
    return [rect[0], C, h];
}
/** Polar → rectangular on channels [1],[2] (LCH→Lab, OKLCH→OKLab). */
function toRect(polar) {
    return [
        polar[0],
        polar[1] * Math.cos(polar[2] * RAD),
        polar[1] * Math.sin(polar[2] * RAD),
    ];
}
function hslToSrgb(hsl) {
    // A powerless hue (NaN, e.g. round-tripped from a grey) is achromatic, so
    // fold it to 0 — otherwise it poisons the output through `0 * NaN`.
    const h = (((Number.isNaN(hsl[0]) ? 0 : hsl[0]) % 360) + 360) % 360;
    const s = hsl[1] / 100;
    const l = hsl[2] / 100;
    const f = (n) => {
        const k = (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [f(0), f(8), f(4)];
}
/** sRGB → hue in degrees (NaN if achromatic), before any out-of-gamut fixup.
 *  Shared by HSL and HWB. */
function srgbHue(rgb) {
    const max = Math.max(rgb[0], rgb[1], rgb[2]);
    const min = Math.min(rgb[0], rgb[1], rgb[2]);
    const d = max - min;
    if (d === 0) {
        return NaN;
    }
    let h;
    if (max === rgb[0])
        h = (rgb[1] - rgb[2]) / d + (rgb[1] < rgb[2] ? 6 : 0);
    else if (max === rgb[1])
        h = (rgb[2] - rgb[0]) / d + 2;
    else
        h = (rgb[0] - rgb[1]) / d + 4;
    return h * 60;
}
function srgbToHsl(rgb) {
    const max = Math.max(rgb[0], rgb[1], rgb[2]);
    const min = Math.min(rgb[0], rgb[1], rgb[2]);
    const l = (min + max) / 2;
    let h = srgbHue(rgb);
    let s = max === min || l === 0 || l === 1 ? 0 : (max - l) / Math.min(l, 1 - l);
    // Out-of-gamut sRGB (lightness outside [0,1]) drives saturation negative;
    // colorjs normalises that by flipping the hue 180° and taking |s|. (HWB,
    // below, takes the raw hue — it has no saturation to go negative.)
    if (s < 0) {
        h += 180;
        s = -s;
    }
    if (h >= 360) {
        h -= 360;
    }
    return [h, s * 100, l * 100];
}
function hwbToSrgb(hwb) {
    const w = hwb[1] / 100;
    const b = hwb[2] / 100;
    if (w + b >= 1) {
        const g = w / (w + b);
        return [g, g, g];
    }
    const rgb = hslToSrgb([hwb[0], 100, 50]);
    const scale = 1 - w - b;
    return [rgb[0] * scale + w, rgb[1] * scale + w, rgb[2] * scale + w];
}
function srgbToHwb(rgb) {
    const w = Math.min(rgb[0], rgb[1], rgb[2]);
    const b = 1 - Math.max(rgb[0], rgb[1], rgb[2]);
    return [srgbHue(rgb), w * 100, b * 100];
}
/** Coords of `space` → XYZ-D65. */
function toXyz(c, space) {
    switch (space) {
        case 'srgb':
            return rgbToXyz(c, srgbLin, LIN_SRGB_TO_XYZ);
        case 'p3':
            return rgbToXyz(c, srgbLin, LIN_P3_TO_XYZ);
        case 'rec2020':
            return rgbToXyz(c, rec2020Lin, LIN_REC2020_TO_XYZ);
        case 'prophoto-rgb':
            return mul(XYZ_D50_TO_D65, rgbToXyz(c, prophotoLin, LIN_PRO_TO_XYZ_D50));
        case 'oklab':
            return oklabToXyz(c);
        case 'oklch':
            return oklabToXyz(toRect(c));
        case 'lab':
            return labToXyz(c);
        case 'lch':
            return labToXyz(toRect(c));
        case 'hsl':
            return rgbToXyz(hslToSrgb(c), srgbLin, LIN_SRGB_TO_XYZ);
        case 'hwb':
            return rgbToXyz(hwbToSrgb(c), srgbLin, LIN_SRGB_TO_XYZ);
    }
}
/** XYZ-D65 → coords of `space`. */
function fromXyz(xyz, space) {
    switch (space) {
        case 'srgb':
            return xyzToRgb(xyz, srgbGam, XYZ_TO_LIN_SRGB);
        case 'p3':
            return xyzToRgb(xyz, srgbGam, XYZ_TO_LIN_P3);
        case 'rec2020':
            return xyzToRgb(xyz, rec2020Gam, XYZ_TO_LIN_REC2020);
        case 'prophoto-rgb':
            return xyzToRgb(mul(XYZ_D65_TO_D50, xyz), prophotoGam, XYZ_D50_TO_LIN_PRO);
        case 'oklab':
            return xyzToOklab(xyz);
        case 'oklch':
            return toPolar(xyzToOklab(xyz));
        case 'lab':
            return xyzToLab(xyz);
        case 'lch':
            return toPolar(xyzToLab(xyz));
        case 'hsl':
            return srgbToHsl(xyzToRgb(xyz, srgbGam, XYZ_TO_LIN_SRGB));
        case 'hwb':
            return srgbToHwb(xyzToRgb(xyz, srgbGam, XYZ_TO_LIN_SRGB));
    }
}
/**
 * Convert `coords` from one space to another. Same-family polar pairs convert
 * directly (so an achromatic colour keeps its hue rather than losing it through
 * the XYZ round-trip); everything else hubs through XYZ-D65.
 */
function convert(coords, from, to) {
    if (from === to) {
        return [coords[0], coords[1], coords[2]];
    }
    if (from === 'oklch' && to === 'oklab')
        return toRect(coords);
    if (from === 'oklab' && to === 'oklch')
        return toPolar(coords);
    if (from === 'lch' && to === 'lab')
        return toRect(coords);
    if (from === 'lab' && to === 'lch')
        return toPolar(coords);
    return fromXyz(toXyz(coords, from), to);
}
// colorjs's inGamut epsilon (matches src/core/gamut.ts) — applied to the
// gamma-encoded RGB channels, the exact quantity the reference `inGamut` tests.
const GAMUT_SLACK = 0.000075;
/**
 * Build a fast in-gamut probe for OKLCH at a *fixed hue*. Returns `(L, C) =>
 * inside?` that reuses all hue-dependent work, for the area picker's per-frame
 * chroma bisection (hue is constant across a frame while L and C vary).
 *
 * OKLab→LMS has first column [1,1,1], so LMS = [L,L,L] + C·dir where `dir`
 * depends only on hue; the per-point cube is the sole nonlinearity. LMS→XYZ→
 * linear-RGB is fused into one matrix `F` up front (D50-adapted for ProPhoto),
 * then the gamut's transfer function + bounds check run per point. This is the
 * same computation as `inGamut([L, C, hue], 'oklch', gamut)` with the fixed
 * matrix chain hoisted out of the loop, so it matches it exactly. (Skipping the
 * gamma encode and testing linear RGB looks tempting but breaks down near black,
 * where the linear↔gamma slope is ~13× and the chroma boundary is near-flat — a
 * tiny linear tolerance there becomes a huge chroma error.) `gamut` must be an
 * RGB space (the only kind the area stretches to).
 */
function oklchGamutProbe(hue, gamut) {
    const h = hue * RAD;
    const cos = Math.cos(h);
    const sin = Math.sin(h);
    const d0 = cos * OKLAB_TO_LMS[0][1] + sin * OKLAB_TO_LMS[0][2];
    const d1 = cos * OKLAB_TO_LMS[1][1] + sin * OKLAB_TO_LMS[1][2];
    const d2 = cos * OKLAB_TO_LMS[2][1] + sin * OKLAB_TO_LMS[2][2];
    const xyzToLin = gamut === 'p3'
        ? XYZ_TO_LIN_P3
        : gamut === 'rec2020'
            ? XYZ_TO_LIN_REC2020
            : gamut === 'prophoto-rgb'
                ? XYZ_D50_TO_LIN_PRO
                : XYZ_TO_LIN_SRGB;
    const F = mulMat(xyzToLin, gamut === 'prophoto-rgb' ? mulMat(XYZ_D65_TO_D50, LMS_TO_XYZ) : LMS_TO_XYZ);
    const gam = gamut === 'rec2020'
        ? rec2020Gam
        : gamut === 'prophoto-rgb'
            ? prophotoGam
            : srgbGam;
    const lo = -GAMUT_SLACK;
    const hi = 1 + GAMUT_SLACK;
    return (L, C) => {
        const p0 = L + C * d0;
        const p1 = L + C * d1;
        const p2 = L + C * d2;
        const c0 = p0 * p0 * p0;
        const c1 = p1 * p1 * p1;
        const c2 = p2 * p2 * p2;
        const r = gam(F[0][0] * c0 + F[0][1] * c1 + F[0][2] * c2);
        if (r < lo || r > hi)
            return false;
        const g = gam(F[1][0] * c0 + F[1][1] * c1 + F[1][2] * c2);
        if (g < lo || g > hi)
            return false;
        const b = gam(F[2][0] * c0 + F[2][1] * c1 + F[2][2] * c2);
        return b >= lo && b <= hi;
    };
}

// colorjs's default inGamut epsilon — small slack so a colour exactly on the
// boundary counts as inside.
const EPSILON = 0.000075;
/** Is `coords` (expressed in `space`) inside the `gamut` RGB space? */
function inGamut(coords, space, gamut) {
    const rgb = space === gamut ? coords : convert(coords, space, gamut);
    return rgb.every((c) => c >= -EPSILON && c <= 1 + EPSILON);
}
function clip(rgb) {
    return [
        Math.min(1, Math.max(0, rgb[0])),
        Math.min(1, Math.max(0, rgb[1])),
        Math.min(1, Math.max(0, rgb[2])),
    ];
}
/** OKLab ΔE: Euclidean distance in OKLab. */
function deltaEOK(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
/**
 * Map an OKLCH colour into `dest` (an RGB gamut) per CSS Color 4: if it already
 * fits, just convert; otherwise binary-search OKLCH chroma down, clipping
 * locally and stopping when the clipped result is within an OKLab JND.
 */
function toGamut(oklch, dest) {
    if (inGamut(oklch, 'oklch', dest)) {
        return convert(oklch, 'oklch', dest);
    }
    const L = oklch[0];
    if (L >= 1) {
        return [1, 1, 1];
    }
    if (L <= 0) {
        return [0, 0, 0];
    }
    const JND = 0.02;
    const EPS = 0.0001;
    const current = [oklch[0], oklch[1], oklch[2]];
    let min = 0;
    let max = oklch[1];
    let minInGamut = true;
    let clipped = clip(convert(current, 'oklch', dest));
    // CSS Color 4 step before the search: if clipping the origin is already within
    // a JND, return that clip rather than reducing chroma at all. This matters
    // where the gamut boundary isn't monotonic in chroma (e.g. ProPhoto near
    // black, where its red channel dips negative then recovers): the bisection's
    // midpoints can sit further out of gamut than the origin, which would
    // otherwise walk the result down to a needlessly low chroma.
    if (deltaEOK(convert(clipped, dest, 'oklab'), convert(oklch, 'oklch', 'oklab')) < JND) {
        return clipped;
    }
    while (max - min > EPS) {
        const chroma = (min + max) / 2;
        current[1] = chroma;
        const inDest = convert(current, 'oklch', dest);
        if (minInGamut && inDest.every((c) => c >= -EPSILON && c <= 1 + EPSILON)) {
            min = chroma;
            continue;
        }
        clipped = clip(inDest);
        const e = deltaEOK(convert(clipped, dest, 'oklab'), convert(current, 'oklch', 'oklab'));
        if (e < JND) {
            if (JND - e < EPS) {
                return clipped;
            }
            minInGamut = false;
            min = chroma;
        }
        else {
            max = chroma;
        }
    }
    return clipped;
}

/** color() identifiers we support → our Space ids. */
const COLOR_FN_SPACES = {
    srgb: 'srgb',
    'display-p3': 'p3',
    rec2020: 'rec2020',
    'prophoto-rgb': 'prophoto-rgb',
};
const clamp01$1 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);
// A bare number: optional sign, digits/decimal, optional exponent.
const NUMBER = String.raw `[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?`;
const NUMBER_RE = new RegExp(`^${NUMBER}$`);
// A hue/angle is a number with an optional angle unit — never a percentage.
const ANGLE_RE = new RegExp(`^(${NUMBER})(deg|grad|rad|turn)?$`);
/** Parse a hue/angle token to degrees, or NaN if it isn't a valid angle (so the
 *  caller rejects it). Percentages are not valid angles. */
function parseAngle(tok) {
    const m = ANGLE_RE.exec(tok);
    if (!m)
        return NaN;
    const n = parseFloat(m[1]);
    switch (m[2]) {
        case 'turn':
            return n * 360;
        case 'grad':
            return n * 0.9;
        case 'rad':
            return (n * 180) / Math.PI;
        default:
            return n; // deg or unitless
    }
}
/** Parse one channel token under the given interpretation. `none` → 0; a token
 *  that isn't a well-formed number (empty, non-numeric, a stray `/` from mixed
 *  alpha syntax) → NaN, which the caller turns into a null parse. */
function chan(tok, kind) {
    tok = tok.trim();
    if (tok === 'none')
        return 0;
    if (kind === 'angle')
        return parseAngle(tok);
    const pct = tok.endsWith('%');
    const numStr = pct ? tok.slice(0, -1) : tok;
    if (!NUMBER_RE.test(numStr))
        return NaN;
    const n = parseFloat(numStr);
    switch (kind) {
        case 'rgb':
            return pct ? n / 100 : n / 255; // → 0..1
        case 'alpha':
            return clamp01$1(pct ? n / 100 : n); // → 0..1, clamped
        case 'pct':
            return n; // hsl S/L, hwb W/B, lab/lch L: value is already 0..100
        case 'okL':
            return pct ? n / 100 : n; // oklch/oklab L → 0..1
        case 'unit':
            return pct ? n / 100 : n; // color() channel → 0..1
        case 'labAB':
            return pct ? n * 1.25 : n; // 100% ↔ 125
        case 'lchC':
            return pct ? n * 1.5 : n; // 100% ↔ 150
        case 'okAB':
            return pct ? n * 0.004 : n; // 100% ↔ 0.4
    }
}
/** Split a function's inner text into channel tokens + an optional alpha token,
 *  handling both legacy comma syntax and modern space / slash syntax. Returns
 *  null for shapes that aren't valid CSS: a comma count other than 3 or 4, or
 *  more than one `/` alpha separator. */
function splitArgs(inner) {
    const t = inner.trim();
    if (t.includes(',')) {
        const parts = t.split(',').map((s) => s.trim());
        if (parts.length === 4)
            return { channels: parts.slice(0, 3), alpha: parts[3] };
        if (parts.length === 3)
            return { channels: parts, alpha: null };
        return null;
    }
    const slash = t.split('/');
    if (slash.length > 2)
        return null;
    return {
        channels: slash[0].trim().split(/\s+/),
        alpha: slash.length === 2 ? slash[1].trim() : null,
    };
}
function hexToSrgb(hex) {
    let h = hex.slice(1);
    if (h.length === 3 || h.length === 4) {
        h = h
            .split('')
            .map((c) => c + c)
            .join('');
    }
    if (h.length !== 6 && h.length !== 8) {
        return null;
    }
    const v = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
    return {
        space: 'srgb',
        coords: [v(0), v(2), v(4)],
        alpha: h.length === 8 ? v(6) : 1,
    };
}
/** Three channel kinds + the space, per function name. */
const FUNCS = {
    rgb: { space: 'srgb', kinds: ['rgb', 'rgb', 'rgb'] },
    rgba: { space: 'srgb', kinds: ['rgb', 'rgb', 'rgb'] },
    hsl: { space: 'hsl', kinds: ['angle', 'pct', 'pct'] },
    hsla: { space: 'hsl', kinds: ['angle', 'pct', 'pct'] },
    hwb: { space: 'hwb', kinds: ['angle', 'pct', 'pct'] },
    lab: { space: 'lab', kinds: ['pct', 'labAB', 'labAB'] },
    lch: { space: 'lch', kinds: ['pct', 'lchC', 'angle'] },
    oklab: { space: 'oklab', kinds: ['okL', 'okAB', 'okAB'] },
    oklch: { space: 'oklch', kinds: ['okL', 'okAB', 'angle'] },
};
/** Assemble a result, rejecting (→ null) when any coord or the alpha is NaN —
 *  the signal that a channel token was ill-formed. */
function result(space, coords, alpha) {
    return Number.isNaN(coords[0]) ||
        Number.isNaN(coords[1]) ||
        Number.isNaN(coords[2]) ||
        Number.isNaN(alpha)
        ? null
        : { space, coords, alpha };
}
function parse(css) {
    const s = css.trim().toLowerCase();
    if (s === 'transparent') {
        return { space: 'srgb', coords: [0, 0, 0], alpha: 0 };
    }
    if (s[0] === '#') {
        return /^#[0-9a-f]+$/.test(s) ? hexToSrgb(s) : null;
    }
    const fn = /^([a-z0-9-]+)\(([^)]*)\)$/.exec(s);
    if (fn) {
        const name = fn[1];
        const args = splitArgs(fn[2]);
        if (!args) {
            return null;
        }
        const { channels, alpha } = args;
        const a = alpha != null ? chan(alpha, 'alpha') : 1;
        if (name === 'color') {
            const space = COLOR_FN_SPACES[channels[0]];
            if (!space || channels.length !== 4) {
                return null;
            }
            return result(space, [
                chan(channels[1], 'unit'),
                chan(channels[2], 'unit'),
                chan(channels[3], 'unit'),
            ], a);
        }
        const spec = FUNCS[name];
        if (!spec || channels.length !== 3) {
            return null;
        }
        return result(spec.space, [
            chan(channels[0], spec.kinds[0]),
            chan(channels[1], spec.kinds[1]),
            chan(channels[2], spec.kinds[2]),
        ], a);
    }
    const named = NAMED_COLORS[s];
    return named ? hexToSrgb(named) : null;
}
/** CSS named colours → hex (the extended set, plus `rebeccapurple`). */
const NAMED_COLORS = {
    aliceblue: '#f0f8ff',
    antiquewhite: '#faebd7',
    aqua: '#00ffff',
    aquamarine: '#7fffd4',
    azure: '#f0ffff',
    beige: '#f5f5dc',
    bisque: '#ffe4c4',
    black: '#000000',
    blanchedalmond: '#ffebcd',
    blue: '#0000ff',
    blueviolet: '#8a2be2',
    brown: '#a52a2a',
    burlywood: '#deb887',
    cadetblue: '#5f9ea0',
    chartreuse: '#7fff00',
    chocolate: '#d2691e',
    coral: '#ff7f50',
    cornflowerblue: '#6495ed',
    cornsilk: '#fff8dc',
    crimson: '#dc143c',
    cyan: '#00ffff',
    darkblue: '#00008b',
    darkcyan: '#008b8b',
    darkgoldenrod: '#b8860b',
    darkgray: '#a9a9a9',
    darkgreen: '#006400',
    darkgrey: '#a9a9a9',
    darkkhaki: '#bdb76b',
    darkmagenta: '#8b008b',
    darkolivegreen: '#556b2f',
    darkorange: '#ff8c00',
    darkorchid: '#9932cc',
    darkred: '#8b0000',
    darksalmon: '#e9967a',
    darkseagreen: '#8fbc8f',
    darkslateblue: '#483d8b',
    darkslategray: '#2f4f4f',
    darkslategrey: '#2f4f4f',
    darkturquoise: '#00ced1',
    darkviolet: '#9400d3',
    deeppink: '#ff1493',
    deepskyblue: '#00bfff',
    dimgray: '#696969',
    dimgrey: '#696969',
    dodgerblue: '#1e90ff',
    firebrick: '#b22222',
    floralwhite: '#fffaf0',
    forestgreen: '#228b22',
    fuchsia: '#ff00ff',
    gainsboro: '#dcdcdc',
    ghostwhite: '#f8f8ff',
    gold: '#ffd700',
    goldenrod: '#daa520',
    gray: '#808080',
    green: '#008000',
    greenyellow: '#adff2f',
    grey: '#808080',
    honeydew: '#f0fff0',
    hotpink: '#ff69b4',
    indianred: '#cd5c5c',
    indigo: '#4b0082',
    ivory: '#fffff0',
    khaki: '#f0e68c',
    lavender: '#e6e6fa',
    lavenderblush: '#fff0f5',
    lawngreen: '#7cfc00',
    lemonchiffon: '#fffacd',
    lightblue: '#add8e6',
    lightcoral: '#f08080',
    lightcyan: '#e0ffff',
    lightgoldenrodyellow: '#fafad2',
    lightgray: '#d3d3d3',
    lightgreen: '#90ee90',
    lightgrey: '#d3d3d3',
    lightpink: '#ffb6c1',
    lightsalmon: '#ffa07a',
    lightseagreen: '#20b2aa',
    lightskyblue: '#87cefa',
    lightslategray: '#778899',
    lightslategrey: '#778899',
    lightsteelblue: '#b0c4de',
    lightyellow: '#ffffe0',
    lime: '#00ff00',
    limegreen: '#32cd32',
    linen: '#faf0e6',
    magenta: '#ff00ff',
    maroon: '#800000',
    mediumaquamarine: '#66cdaa',
    mediumblue: '#0000cd',
    mediumorchid: '#ba55d3',
    mediumpurple: '#9370db',
    mediumseagreen: '#3cb371',
    mediumslateblue: '#7b68ee',
    mediumspringgreen: '#00fa9a',
    mediumturquoise: '#48d1cc',
    mediumvioletred: '#c71585',
    midnightblue: '#191970',
    mintcream: '#f5fffa',
    mistyrose: '#ffe4e1',
    moccasin: '#ffe4b5',
    navajowhite: '#ffdead',
    navy: '#000080',
    oldlace: '#fdf5e6',
    olive: '#808000',
    olivedrab: '#6b8e23',
    orange: '#ffa500',
    orangered: '#ff4500',
    orchid: '#da70d6',
    palegoldenrod: '#eee8aa',
    palegreen: '#98fb98',
    paleturquoise: '#afeeee',
    palevioletred: '#db7093',
    papayawhip: '#ffefd5',
    peachpuff: '#ffdab9',
    peru: '#cd853f',
    pink: '#ffc0cb',
    plum: '#dda0dd',
    powderblue: '#b0e0e6',
    purple: '#800080',
    rebeccapurple: '#663399',
    red: '#ff0000',
    rosybrown: '#bc8f8f',
    royalblue: '#4169e1',
    saddlebrown: '#8b4513',
    salmon: '#fa8072',
    sandybrown: '#f4a460',
    seagreen: '#2e8b57',
    seashell: '#fff5ee',
    sienna: '#a0522d',
    silver: '#c0c0c0',
    skyblue: '#87ceeb',
    slateblue: '#6a5acd',
    slategray: '#708090',
    slategrey: '#708090',
    snow: '#fffafa',
    springgreen: '#00ff7f',
    steelblue: '#4682b4',
    tan: '#d2b48c',
    teal: '#008080',
    thistle: '#d8bfd8',
    tomato: '#ff6347',
    turquoise: '#40e0d0',
    violet: '#ee82ee',
    wheat: '#f5deb3',
    white: '#ffffff',
    whitesmoke: '#f5f5f5',
    yellow: '#ffff00',
    yellowgreen: '#9acd32',
};

/**
 * colorjs's toPrecision: round to (precision − integer-digit-count) decimal
 * places, with the integer-digit count clamped to ≥ 0 — so values below 1 keep
 * `precision` decimals rather than `precision` significant figures. Returned as
 * a number, so `String()` drops any trailing zeros.
 */
function round(n, precision) {
    if (n === 0) {
        return 0;
    }
    const intDigits = Math.max(0, Math.floor(Math.log10(Math.abs(n))) + 1);
    const mult = 10 ** Math.max(0, precision - intDigits);
    return Math.round(n * mult) / mult;
}
const fmt = (n, p) => String(round(n, p));
function hex(srgb, alpha) {
    const h = (c) => Math.round(Math.min(1, Math.max(0, c)) * 255)
        .toString(16)
        .padStart(2, '0');
    const base = `#${h(srgb[0])}${h(srgb[1])}${h(srgb[2])}`;
    return alpha < 1 ? base + h(alpha) : base;
}
/**
 * Serialise `coords` (in `space`, with `alpha`) to a CSS string. `format: 'hex'`
 * expects sRGB coords and emits `#rrggbb`/`#rrggbbaa`.
 */
function serialize(coords, space, alpha = 1, opts = {}) {
    if (opts.format === 'hex') {
        return hex(coords, alpha);
    }
    const p = opts.precision ?? 5;
    const f = (n) => fmt(n, p);
    const a = alpha < 1 ? ` / ${f(alpha)}` : '';
    const [x, y, z] = coords;
    switch (space) {
        case 'oklch':
            return `oklch(${f(x * 100)}% ${f(y)} ${f(z)}${a})`;
        case 'oklab':
            return `oklab(${f(x * 100)}% ${f(y)} ${f(z)}${a})`;
        case 'lch':
            return `lch(${f(x)}% ${f(y)} ${f(z)}${a})`;
        case 'lab':
            return `lab(${f(x)}% ${f(y)} ${f(z)}${a})`;
        case 'hsl':
            return `hsl(${f(x)} ${f(y)}% ${f(z)}%${a})`;
        case 'hwb':
            return `hwb(${f(x)} ${f(y)}% ${f(z)}%${a})`;
        case 'p3':
            return `color(display-p3 ${f(x)} ${f(y)} ${f(z)}${a})`;
        case 'rec2020':
            return `color(rec2020 ${f(x)} ${f(y)} ${f(z)}${a})`;
        case 'prophoto-rgb':
            return `color(prophoto-rgb ${f(x)} ${f(y)} ${f(z)}${a})`;
        case 'srgb':
            return `color(srgb ${f(x)} ${f(y)} ${f(z)}${a})`;
    }
}

// Dropdown order: everyday sRGB/CSS formats first, then perceptual, then
// wide-gamut — familiar-first, matching Figma / DevTools conventions.
const EDIT_MODES = [
    'hex',
    'srgb',
    'css',
    'hsl',
    'hwb',
    'oklch',
    'oklab',
    'lch',
    'lab',
    'p3',
    'rec2020',
];
/** Modes whose space only covers sRGB: switching into one snaps a wider-gamut
 *  colour into sRGB so its channels stay meaningful. The perceptual (OKLCH /
 *  OKLab / LCH / Lab) and wide-RGB (P3 / Rec2020) modes keep the full colour. */
const SRGB_BOUND_MODES = ['srgb', 'css', 'hsl', 'hwb', 'hex'];
/** Whether the area draws the sRGB gamut boundary in this mode: shown for every
 *  mode whose space can exceed sRGB, hidden for the sRGB-bound ones (where the
 *  whole plane is reachable, so the line carries no information). */
function showsGamutBoundary(mode) {
    return !SRGB_BOUND_MODES.includes(mode);
}
/** The gamut the colour area stretches to in a given mode: sRGB for the
 *  sRGB-bound modes, P3 for every wide mode (P3, Rec2020, and the perceptual
 *  OKLCH/OKLab/LCH/Lab). P3 is the widest gamut real displays render, so the
 *  plane's edge is the displayable limit — the thumb can't slide into colours
 *  the screen can't show. The sRGB boundary stays as the inner reference line. */
function areaStretch(mode) {
    return SRGB_BOUND_MODES.includes(mode) ? 'srgb' : 'p3';
}
/** Hard cap on OKLCH chroma. Beyond any real display gamut (ProPhoto tops out
 *  near 0.49), so it rejects nonsense input (e.g. a typed chroma of 40000)
 *  without ever clipping a colour that could actually be shown. */
const MAX_CHROMA = 0.5;
const MODE_LABELS = {
    oklch: 'OKLCH',
    oklab: 'OKLab',
    lch: 'LCH',
    lab: 'Lab',
    srgb: 'RGB',
    css: 'CSS',
    hsl: 'HSL',
    hwb: 'HWB',
    hex: 'HEX',
    p3: 'P3',
    rec2020: 'Rec2020',
};
/** Colour-engine space id backing an edit mode (hex + css share the sRGB space). */
function modeSpaceId(mode) {
    return mode === 'hex' || mode === 'css' ? 'srgb' : mode;
}
/**
 * Per-mode channel descriptors, in display units that match CSS Color 4 /
 * oklch.com / DevTools conventions (`display = coord * scale`):
 * - OKLCH: L 0–100, C 0–0.5, H 0–360       · OKLab: L 0–100, a/b ±0.4
 * - LCH:   L 0–100, C 0–150, H 0–360        · Lab:   L 0–100, a/b ±125
 * - RGB:   R/G/B 0–255 (integers)           · HSL:   H 0–360, S/L 0–100
 * - HWB:   H 0–360, W/B 0–100               · P3 / Rec2020: R/G/B 0–1
 * (HEX has no numeric channels — it uses a single text field.)
 */
const MODE_CHANNELS = {
    oklch: [
        { key: 'l', label: 'L', min: 0, max: 100, step: 1, scale: 100 },
        { key: 'c', label: 'C', min: 0, max: MAX_CHROMA, step: 0.01, scale: 1 },
        { key: 'h', label: 'H', min: 0, max: 360, step: 1, scale: 1 },
    ],
    oklab: [
        { key: 'l', label: 'L', min: 0, max: 100, step: 1, scale: 100 },
        { key: 'a', label: 'a', min: -0.4, max: 0.4, step: 0.01, scale: 1 },
        { key: 'b', label: 'b', min: -0.4, max: 0.4, step: 0.01, scale: 1 },
    ],
    lch: [
        { key: 'l', label: 'L', min: 0, max: 100, step: 1, scale: 1 },
        { key: 'c', label: 'C', min: 0, max: 150, step: 1, scale: 1 },
        { key: 'h', label: 'H', min: 0, max: 360, step: 1, scale: 1 },
    ],
    lab: [
        { key: 'l', label: 'L', min: 0, max: 100, step: 1, scale: 1 },
        { key: 'a', label: 'a', min: -125, max: 125, step: 1, scale: 1 },
        { key: 'b', label: 'b', min: -125, max: 125, step: 1, scale: 1 },
    ],
    srgb: [
        { key: 'r', label: 'R', min: 0, max: 255, step: 1, scale: 255 },
        { key: 'g', label: 'G', min: 0, max: 255, step: 1, scale: 255 },
        { key: 'b', label: 'B', min: 0, max: 255, step: 1, scale: 255 },
    ],
    // CSS mode = sRGB channels, output as legacy `rgba(r, g, b, a)`.
    css: [
        { key: 'r', label: 'R', min: 0, max: 255, step: 1, scale: 255 },
        { key: 'g', label: 'G', min: 0, max: 255, step: 1, scale: 255 },
        { key: 'b', label: 'B', min: 0, max: 255, step: 1, scale: 255 },
    ],
    hsl: [
        { key: 'h', label: 'H', min: 0, max: 360, step: 1, scale: 1 },
        { key: 's', label: 'S', min: 0, max: 100, step: 1, scale: 1 },
        { key: 'l', label: 'L', min: 0, max: 100, step: 1, scale: 1 },
    ],
    hwb: [
        { key: 'h', label: 'H', min: 0, max: 360, step: 1, scale: 1 },
        { key: 'w', label: 'W', min: 0, max: 100, step: 1, scale: 1 },
        { key: 'b', label: 'B', min: 0, max: 100, step: 1, scale: 1 },
    ],
    p3: [
        { key: 'r', label: 'R', min: 0, max: 1, step: 0.01, scale: 1 },
        { key: 'g', label: 'G', min: 0, max: 1, step: 0.01, scale: 1 },
        { key: 'b', label: 'B', min: 0, max: 1, step: 0.01, scale: 1 },
    ],
    rec2020: [
        { key: 'r', label: 'R', min: 0, max: 1, step: 0.01, scale: 1 },
        { key: 'g', label: 'G', min: 0, max: 1, step: 0.01, scale: 1 },
        { key: 'b', label: 'B', min: 0, max: 1, step: 0.01, scale: 1 },
    ],
};
/** Decimal places a channel is displayed at, from its step — shared by the open
 *  numeric inputs and the collapsed readout so they round identically. */
function digitsFor(step) {
    return step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
}
/** Coalesce null / NaN (e.g. a powerless OKLCH hue on a grey) to 0. */
function num(x) {
    return x == null || Number.isNaN(x) ? 0 : x;
}
function clamp(x, lo, hi) {
    return Math.min(hi, Math.max(lo, x));
}
/** Does the engine accept this exact string as a colour? */
function parses(s) {
    return parse(s) !== null;
}
/** First embedded colour token (a hex literal or a colour function) in text. */
const COLOR_TOKEN = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b|(?:rgba?|hsla?|hwb|(?:ok)?lab|(?:ok)?lch|color)\([^)]*\)/i;
/**
 * Recover a colour from a messy paste, the way a good colour input should. The
 * caller has already tried a straight parse; here we strip CSS-declaration noise
 * — a leading `prop:`, a trailing `;`/`,`/`!important`, wrapping quotes — and,
 * failing that, pull the first colour token out of the surrounding text (so
 * `color: #ff0000;`, `"#ff0000"`, `rgb(0 0 0) !important`, even
 * `var(--x, #ff0000)` resolve). Returns null when nothing parseable is found.
 */
function extractColorString(trimmed) {
    const stripped = trimmed
        .replace(/^[a-z-]+\s*:\s*/i, '') // leading CSS property name
        .replace(/\s*!important\s*$/i, '') // !important flag
        .replace(/[;,]+\s*$/, '') // trailing ; or ,
        .replace(/^["'`]+|["'`]+$/g, '') // wrapping quotes / backticks
        .trim();
    if (stripped !== trimmed && parses(stripped)) {
        return stripped;
    }
    const token = COLOR_TOKEN.exec(trimmed)?.[0];
    if (!token) {
        return null;
    }
    if (parses(token)) {
        return token;
    }
    // Last resort: a colour whose only fault is mixed separators — legacy commas
    // plus a `/ alpha` (`rgb(255, 0, 0 / 0.5)`), which the strict parser rejects.
    // Normalise the commas to spaces and retry, keeping the real channels and the
    // alpha. A genuinely missing channel collapses away and still fails (too few
    // channels) — it is never invented.
    const normalised = token.replace(/^([a-z]+)\((.*)\)$/i, (_m, fn, inner) => `${fn}(${inner.replace(/,/g, ' ')})`);
    return normalised !== token && parses(normalised) ? normalised : null;
}
class OklchColor {
    /** Canonical OKLCH coords: [L 0..1, C 0..~0.4, H 0..360]. */
    coords;
    alpha;
    format;
    /** Verbatim source string; returned by `serialize()` until edited (then null). */
    source;
    constructor(coords, alpha, format, source) {
        // Clamp to sane bounds at the single construction choke point, so typed or
        // parsed nonsense (e.g. a chroma of 40000 in the colour text field) can't
        // take hold. Every real colour already sits inside these.
        this.coords = [
            clamp(coords[0], 0, 1),
            clamp(coords[1], 0, MAX_CHROMA),
            clamp(coords[2], 0, 360),
        ];
        this.alpha = clamp(alpha, 0, 1);
        this.format = format;
        this.source = source;
    }
    /** A copy marked as edited: drops the verbatim `source` string so `serialize()`
     *  recomputes from the (clamped) coords. Used when the colour text field is
     *  typed into, so an out-of-range entry shows as its clamped value rather than
     *  echoing the nonsense back. */
    asEdited() {
        return new OklchColor([this.coords[0], this.coords[1], this.coords[2]], this.alpha, this.format, null);
    }
    /** Mutable copy of the canonical OKLCH coords (engine functions take a tuple). */
    oklch() {
        return [this.coords[0], this.coords[1], this.coords[2]];
    }
    /** Alpha to serialise: opaque colours (or formats without alpha) use 1, which
     *  the serialiser omits — so the output stays clean. */
    outAlpha() {
        return this.format.hasAlpha ? this.alpha : 1;
    }
    /** Coords to serialise for output `space`: gamut-mapped for the bounded spaces
     *  (RGB + HSL/HWB), matching how the old colorjs serialise mapped them; raw for
     *  the unbounded perceptual spaces (OKLCH/OKLab/LCH/Lab). */
    outputCoords(space) {
        switch (space) {
            case 'srgb':
            case 'p3':
            case 'rec2020':
            case 'prophoto-rgb':
                return toGamut(this.oklch(), space);
            case 'hsl':
            case 'hwb':
                return convert(toGamut(this.oklch(), 'srgb'), 'srgb', space);
            default:
                return convert(this.oklch(), 'oklch', space);
        }
    }
    // ---- Parsing ------------------------------------------------------------
    static fromString(css) {
        const trimmed = css.trim();
        // Clean input parses straight through (keeping its verbatim source format);
        // a messy paste is sanitised — `extractColorString` recovers the colour from
        // a CSS declaration / quoted value / `!important`, or we throw on nonsense.
        let source = trimmed;
        let parsed = parse(trimmed);
        if (!parsed) {
            const cleaned = extractColorString(trimmed);
            if (cleaned === null) {
                throw new Error(`unparseable colour: ${css}`);
            }
            source = cleaned;
            parsed = parse(cleaned);
            if (!parsed) {
                throw new Error(`unparseable colour: ${css}`);
            }
        }
        const sid = parsed.space;
        const k = sid === 'oklch' ? parsed.coords : convert(parsed.coords, sid, 'oklch');
        const coords = [num(k[0]), num(k[1]), num(k[2])];
        const alpha = num(parsed.alpha);
        const isHex = source.startsWith('#');
        // Legacy comma syntax (`rgb(r, g, b)` / `rgba(r, g, b, a)`) is the CSS mode;
        // the modern space-separated `rgb(r g b)` stays plain RGB.
        const isCss = /^rgba?\(/i.test(source) && source.includes(',');
        const hasAlpha = alpha < 1 ||
            /^#(?:[0-9a-f]{4}|[0-9a-f]{8})$/i.test(source) ||
            /\b(?:rgba|hsla)\s*\(/i.test(source) ||
            source.includes('/');
        const format = {
            spaceId: isHex ? 'srgb' : sid,
            isHex,
            isCss,
            hasAlpha,
        };
        return new OklchColor(coords, alpha, format, source);
    }
    static tryFromString(css) {
        try {
            return OklchColor.fromString(css);
        }
        catch {
            return null;
        }
    }
    /** Predicate for `accept`: is this a string the model can parse? */
    static isColorString(value) {
        return (typeof value === 'string' && OklchColor.tryFromString(value) !== null);
    }
    // ---- Serialisation ------------------------------------------------------
    /** CSS string for the binding, in the remembered/selected output format. */
    serialize() {
        if (this.source !== null) {
            return this.source;
        }
        const f = this.format;
        if (f.isHex) {
            // Always full-length hex (#ffffff, never #fff); 8 digits when alpha < 1.
            return serialize(toGamut(this.oklch(), 'srgb'), 'srgb', this.outAlpha(), {
                format: 'hex',
            });
        }
        if (f.isCss) {
            // Legacy comma syntax, always 4-arg: `rgba(r, g, b, a)`.
            const c = toGamut(this.oklch(), 'srgb');
            const ch = (i) => Math.round(num(c[i]) * 255);
            return `rgba(${ch(0)}, ${ch(1)}, ${ch(2)}, ${+this.alpha.toFixed(2)})`;
        }
        if (f.spaceId === 'srgb') {
            // 0–255 integer rgb() (the form people expect), space-separated.
            const c = toGamut(this.oklch(), 'srgb');
            const ch = (i) => Math.round(num(c[i]) * 255);
            const a = f.hasAlpha ? ` / ${+this.alpha.toFixed(3)}` : '';
            return `rgb(${ch(0)} ${ch(1)} ${ch(2)}${a})`;
        }
        return serialize(this.outputCoords(f.spaceId), f.spaceId, this.outAlpha(), {
            precision: 4,
        });
    }
    /**
     * The collapsed-row string: the *same rounded channel values the open inputs
     * show* (via `channelValues` + `digitsFor`), with channel units but no function
     * wrapper or colour-space name — so the row reads like the inputs and never
     * repeats the mode dropdown's label. `wrapReadout` turns it back into CSS for
     * editing. Distinct from `serialize()`, which keeps full precision for the value.
     */
    readoutString() {
        const mode = this.mode;
        if (mode === 'hex') {
            return this.gamutCss();
        }
        const chans = MODE_CHANNELS[mode];
        const v = this.channelValues(mode);
        const s = (i) => v[i].toFixed(digitsFor(chans[i].step));
        if (mode === 'css') {
            // CSS mode IS the legacy function form, so the row shows it in full
            // (always 4-arg) rather than as bare channels.
            return `rgba(${s(0)}, ${s(1)}, ${s(2)}, ${+this.alpha.toFixed(2)})`;
        }
        const a = this.format.hasAlpha ? ` / ${this.alpha.toFixed(2)}` : '';
        switch (mode) {
            case 'oklch':
            case 'oklab':
            case 'lch':
            case 'lab':
                return `${s(0)}% ${s(1)} ${s(2)}${a}`; // L is a percentage
            case 'hsl':
            case 'hwb':
                return `${s(0)} ${s(1)}% ${s(2)}%${a}`; // S/L or W/B are percentages
            case 'srgb':
            case 'p3':
            case 'rec2020':
                return `${s(0)} ${s(1)} ${s(2)}${a}`; // bare R G B
        }
    }
    /** Re-wrap the bare `readoutString()` channels into a full CSS string for the
     *  current mode, so a typed edit of the collapsed row round-trips. */
    wrapReadout(text) {
        switch (this.mode) {
            case 'hex':
                return text;
            case 'srgb':
                return `rgb(${text})`;
            case 'css':
                return `rgba(${text})`;
            case 'hsl':
                return `hsl(${text})`;
            case 'hwb':
                return `hwb(${text})`;
            case 'p3':
                return `color(display-p3 ${text})`;
            case 'rec2020':
                return `color(rec2020 ${text})`;
            default:
                return `${this.mode}(${text})`; // oklch / oklab / lch / lab
        }
    }
    /** Full-gamut CSS (`oklch(…)`) for painting the swatch in modern browsers. */
    displayCss() {
        return serialize(this.oklch(), 'oklch', this.outAlpha());
    }
    /** Gamut-mapped sRGB hex, for the swatch fallback / hex field. Always
     *  full-length (`#ffffff`, never `#fff`). */
    gamutCss() {
        return serialize(toGamut(this.oklch(), 'srgb'), 'srgb', this.outAlpha(), {
            format: 'hex',
        });
    }
    // ---- Channel access -----------------------------------------------------
    /** Canonical coords converted into `mode`'s space (NaN coalesced to 0). */
    coordsIn(mode) {
        const sid = modeSpaceId(mode);
        const c = sid === 'oklch' ? this.oklch() : convert(this.oklch(), 'oklch', sid);
        return {
            coords: [num(c[0]), num(c[1]), num(c[2])],
            alpha: this.alpha,
        };
    }
    /** Per-channel values in display units for `mode`'s numeric inputs. */
    channelValues(mode) {
        const { coords } = this.coordsIn(mode);
        return MODE_CHANNELS[mode].map((ch, i) => {
            const v = coords[i] * ch.scale;
            // Snap to 0 anything that rounds to 0 at the channel's display precision
            // (half the step), so a tiny negative never renders as "-0.00"/"-0", then
            // clamp to the channel's range — matching the numeric inputs' range
            // constraint, so the inputs and the collapsed readout agree.
            return clamp(Math.abs(v) < 0.5 * ch.step ? 0 : v, ch.min, ch.max);
        });
    }
    /** New colour with channel `index` of `mode` set to `displayValue`. */
    withChannel(mode, index, displayValue) {
        const sid = modeSpaceId(mode);
        const { coords, alpha } = this.coordsIn(mode);
        const next = [coords[0], coords[1], coords[2]];
        next[index] = displayValue / MODE_CHANNELS[mode][index].scale;
        const k = convert(next, sid, 'oklch');
        return new OklchColor([num(k[0]), num(k[1]), num(k[2])], alpha, this.format, null);
    }
    withAlpha(alpha) {
        return new OklchColor([this.coords[0], this.coords[1], this.coords[2]], alpha, { ...this.format, hasAlpha: true }, null);
    }
    /** Whether the bound value carries an alpha channel (drives the alpha UI). */
    get hasAlpha() {
        return this.format.hasAlpha;
    }
    /** The edit mode the value currently serialises as (its output format). */
    get mode() {
        if (this.format.isHex) {
            return 'hex';
        }
        if (this.format.isCss) {
            return 'css';
        }
        // EditMode values are engine space ids, so a known space maps straight to
        // its mode; anything else (prophoto-rgb, …) falls back to OKLCH.
        const id = this.format.spaceId;
        return EDIT_MODES.includes(id) ? id : 'oklch';
    }
    /**
     * New colour serialised in `mode`'s format. The sRGB-bound modes (RGB / HSL /
     * HWB / HEX) can't hold a wider-gamut colour, so switching into one snaps it to
     * the nearest in-sRGB colour; the perceptual (OKLCH / OKLab / LCH / Lab) and
     * wide-RGB (P3 / Rec2020) modes keep the colour untouched.
     */
    withFormat(mode) {
        // Switching into an sRGB-bound mode snaps a wider colour to the nearest
        // in-sRGB one (so its channels stay meaningful); the area itself stays freely
        // selectable, and the perceptual / wide-RGB modes keep the colour untouched.
        let coords = [this.coords[0], this.coords[1], this.coords[2]];
        if (SRGB_BOUND_MODES.includes(mode) && !this.inGamut('srgb')) {
            const back = convert(toGamut(this.oklch(), 'srgb'), 'srgb', 'oklch');
            coords = [num(back[0]), num(back[1]), num(back[2])];
        }
        return new OklchColor(coords, this.alpha, {
            spaceId: modeSpaceId(mode),
            isHex: mode === 'hex',
            isCss: mode === 'css',
            hasAlpha: this.format.hasAlpha,
        }, null);
    }
    /** OKLCH hue (degrees) — the fixed axis of the locked L×C area plane. */
    areaHue() {
        return this.coords[2];
    }
    /** New colour with the area plane's fixed hue (OKLCH H) set to `hue` (degrees). */
    withAreaHue(hue) {
        return new OklchColor([this.coords[0], this.coords[1], num(hue)], this.alpha, this.format, null);
    }
    /** Adopt coords from an arbitrary CSS string (e.g. the area picker's onChange). */
    withCss(css) {
        const p = parse(css);
        if (!p) {
            return this;
        }
        const k = convert(p.coords, p.space, 'oklch');
        return new OklchColor([num(k[0]), num(k[1]), num(k[2])], this.alpha, this.format, null);
    }
    // ---- Misc ---------------------------------------------------------------
    inGamut(gamut) {
        return inGamut(this.oklch(), 'oklch', gamut);
    }
    /** sRGB and P3 are the only gamuts with real consumer displays, so the readout
     *  names those two and lumps anything beyond P3 as "wide".
     *
     *  In an sRGB-bound mode (RGB/HEX/CSS/HSL/HWB) the binding value is always a
     *  gamut-mapped sRGB colour, so the readout is always sRGB — showing P3/wide
     *  there would contradict the mode (the area can still be dragged into the wide
     *  region, but the output clamps). In a wide mode it's the smallest containing
     *  gamut, except in the degenerate near-black/near-white tips, where the chroma
     *  is imperceptible and the displayed colour is ~black/white in every gamut —
     *  reported as sRGB so the label doesn't churn as you drag the dark/light edges. */
    gamutLabel() {
        if (!showsGamutBoundary(this.mode)) {
            return 'sRGB';
        }
        const shown = toGamut(this.oklch(), 'srgb'); // colour as actually displayed
        if (Math.max(...shown) < 0.03 || Math.min(...shown) > 0.97) {
            return 'sRGB';
        }
        if (this.inGamut('srgb')) {
            return 'sRGB';
        }
        if (this.inGamut('p3')) {
            return 'P3';
        }
        return 'wide';
    }
    equals(other) {
        const e = 1e-6;
        return (
        // Output format is part of identity, so switching mode counts as a change
        // (re-serialises + re-renders the collapsed readout).
        this.format.spaceId === other.format.spaceId &&
            this.format.isHex === other.format.isHex &&
            this.format.isCss === other.format.isCss &&
            this.format.hasAlpha === other.format.hasAlpha &&
            Math.abs(this.coords[0] - other.coords[0]) < e &&
            Math.abs(this.coords[1] - other.coords[1]) < e &&
            Math.abs(this.coords[2] - other.coords[2]) < e &&
            Math.abs(this.alpha - other.alpha) < e);
    }
}

/** Gradient is rasterised at 1/4 of the backing resolution, then scaled up. */
const SUBSAMPLE = 4;
/** Upper bound for the chroma bisection — beyond every physical display gamut. */
const CHROMA_CEILING = 0.5;
/** Bisection steps: 16 ⇒ ~0.5/2¹⁶ ≈ 8e-6 chroma resolution. */
const BISECT_STEPS = 16;
/** Samples in the per-lightness chroma curve handed back for thumb placement. */
const CURVE_SAMPLES = 128;
/** Gamut nesting by chroma extent, narrow → wide. The plane's stretch gamut is
 *  the canvas edge; only gamuts strictly narrower than it are drawn as lines. */
const GAMUT_RANK = {
    srgb: 0,
    p3: 1,
    rec2020: 2,
    'prophoto-rgb': 3,
    // non-RGB spaces never act as a plane gamut; rank them past the widest.
    hsl: 9,
    hwb: 9,
    lab: 9,
    lch: 9,
    oklab: 9,
    oklch: 9,
};
/** Boundary lines available to stroke over the plane, narrow → wide. Each is
 *  drawn when the plane is stretched to it or wider. The plugin caps the stretch
 *  at P3 (`areaStretch`), so a wide plane shows the solid sRGB line inside and the
 *  dashed P3 line riding the edge (the displayable limit). */
const BOUNDARIES = [
    { space: 'srgb', color: 'rgba(255,255,255,0.7)', width: 1.5, dash: [] },
    { space: 'p3', color: 'rgba(255,255,255,0.4)', width: 1, dash: [3, 3] },
];
/**
 * Largest in-gamut chroma at lightness `L`, by bisecting a prebuilt per-hue
 * `probe` (see `oklchGamutProbe`). Returns 0 when the gamut doesn't even contain
 * the achromatic point at this lightness (so the row contributes nothing). The
 * probe is built once per hue/gamut and reused across every lightness — that
 * reuse is the bulk of the per-frame saving.
 */
function maxChroma(probe, L, ceiling = CHROMA_CEILING) {
    if (!probe(L, 0)) {
        return 0;
    }
    let inside = 0;
    let outside = ceiling;
    for (let i = 0; i < BISECT_STEPS; i++) {
        const mid = (inside + outside) / 2;
        if (probe(L, mid)) {
            inside = mid;
        }
        else {
            outside = mid;
        }
    }
    return inside;
}
/** Sample an evenly-spaced [0,1]-indexed curve at `t`, linearly interpolated. */
function sampleCurve(curve, t) {
    const last = curve.length - 1;
    const pos = Math.max(0, Math.min(last, t * last));
    const i = Math.floor(pos);
    const frac = pos - i;
    return curve[i] * (1 - frac) + curve[Math.min(i + 1, last)] * frac;
}
const toByte = (v) => Math.round(Math.max(0, Math.min(1, v ?? 0)) * 255);
/** Trace one gamut's boundary as canvas points, x normalised to the stretch edge. */
function traceBoundary(spec, hue, stretch, W, H, dpr) {
    const STEPS = 100;
    const probe = oklchGamutProbe(hue, spec.space);
    const points = [];
    for (let s = 0; s <= STEPS; s++) {
        const L = s / STEPS;
        const edge = sampleCurve(stretch, L);
        if (edge <= 0) {
            continue; // empty row — no chroma range to plot against
        }
        // Search within the stretch edge: a narrower gamut (sRGB inside P3, or sRGB
        // and P3 inside Rec2020) lands inside it. Tying the search to `edge` keeps
        // the ratio ordered and bounded even at the near-black/near-white extremes,
        // where `edge` itself is tiny and an independent search is noisy.
        const c = maxChroma(probe, L, edge);
        if (c <= 0) {
            continue; // gamut empty at this lightness
        }
        // A line riding the very edge (the stretch gamut's own boundary, e.g. P3 on
        // a P3 plane) would be half-clipped by the canvas border; pull it in by half
        // its stroke so it hugs the edge fully visible.
        const x = Math.min((c / edge) * W, W - (spec.width * dpr) / 2);
        points.push({ x, y: (1 - L) * H });
    }
    return {
        points,
        color: spec.color,
        lineWidth: spec.width * dpr,
        dash: spec.dash.map((d) => d * dpr),
    };
}
/** Compute the plane: subsampled gradient pixels + full-res boundary lines. */
function computeArea(req) {
    const backingW = Math.round(req.cssW * req.dpr);
    const backingH = Math.round(req.cssH * req.dpr);
    const W = Math.round(backingW / SUBSAMPLE);
    const H = Math.round(backingH / SUBSAMPLE);
    const target = req.supportsP3 ? 'p3' : 'srgb';
    // Stretch reference: the chroma ceiling of `req.stretch` at each lightness.
    // Drives both the gradient's per-row width and the boundary x-normalisation —
    // so in an sRGB stretch the whole plane is exactly the sRGB gamut.
    const stretchProbe = oklchGamutProbe(req.hue, req.stretch);
    const stretch = new Float64Array(CURVE_SAMPLES);
    for (let i = 0; i < CURVE_SAMPLES; i++) {
        stretch[i] = maxChroma(stretchProbe, i / (CURVE_SAMPLES - 1));
    }
    // Rasterise the gradient: column x maps to chroma (x/W of the row's stretch
    // max), row y maps to lightness (top = 1).
    const pixels = new Uint8ClampedArray(W * H * 4);
    const invH = H > 1 ? 1 / (H - 1) : 0;
    const invW = W > 1 ? 1 / (W - 1) : 0;
    for (let y = 0; y < H; y++) {
        const L = 1 - y * invH;
        const rowMax = sampleCurve(stretch, L);
        for (let x = 0; x < W; x++) {
            const chroma = x * invW * rowMax;
            const [r, g, b] = convert([L, chroma, req.hue], 'oklch', target);
            const o = (y * W + x) * 4;
            pixels[o] = toByte(r);
            pixels[o + 1] = toByte(g);
            pixels[o + 2] = toByte(b);
            pixels[o + 3] = 255;
        }
    }
    // Draw a line for every gamut up to and including the stretch: narrower gamuts
    // fall inside (the solid sRGB line) and the stretch gamut itself rides the edge
    // (the dashed P3 line on a P3 plane), marking the displayable limit. An sRGB
    // plane stays bare — the whole area is in gamut, so there's nothing to mark.
    const boundaries = req.stretch === 'srgb'
        ? []
        : BOUNDARIES.filter((spec) => GAMUT_RANK[spec.space] <= GAMUT_RANK[req.stretch]).map((spec) => traceBoundary(spec, req.hue, stretch, backingW, backingH, req.dpr));
    return {
        pixels,
        W,
        H,
        backingW,
        backingH,
        chromaCurve: stretch,
        boundaries,
    };
}

/*
 * Interactive OKLCH lightness×chroma plane: a canvas gradient with the gamut
 * boundary drawn over it, a draggable thumb, and keyboard nudging. The plane is
 * always a fixed-hue L×C slice (see ./area-compute for the raster); this file is
 * purely the DOM/interaction layer.
 *
 * State is two plain coord triples — `#value` (committed) and `#live` (the
 * optimistic value mid-drag, so the thumb tracks the pointer without waiting for
 * the binding round-trip) — and `#sync()` reapplies the three effects (thumb,
 * drag class, repaint) after any change. The repaint is rAF-coalesced and only
 * runs when the hue moves, so dragging within a slice never re-rasterises.
 */
/** Chroma span assumed for the canvas before the first frame builds the curve. */
const FALLBACK_CHROMA = 0.37;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const finite = (v) => v == null || Number.isNaN(v) ? 0 : v;
/** Whether a 2D canvas can be backed by Display-P3 (probe the real API). */
const wideCanvas = (() => {
    try {
        const ctx = document
            .createElement('canvas')
            .getContext('2d', { colorSpace: 'display-p3' });
        const attrs = ctx?.getContextAttributes?.();
        return attrs?.colorSpace === 'display-p3';
    }
    catch {
        return false;
    }
})();
function strokeBoundary(ctx, b) {
    if (b.points.length < 2) {
        return;
    }
    ctx.save();
    ctx.strokeStyle = b.color;
    ctx.lineWidth = b.lineWidth;
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.setLineDash(b.dash);
    ctx.beginPath();
    b.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    ctx.restore();
}
/** Interactive OKLCH L×C plane bound to a host element + an onChange callback. */
class AreaPicker {
    #abort = new AbortController();
    #root;
    #canvas;
    #emit;
    #value = null; // committed colour
    #live = null; // optimistic colour while dragging
    #curve = null; // per-lightness chroma ceiling (last frame)
    // The gamut the plane is stretched to (the current mode's own gamut). Drives
    // the gradient extent and which narrower gamuts are drawn as boundary lines.
    #stretch = 'p3';
    #paintedHue = NaN; // hue of the last raster; -repaint only when it changes
    #raf = null;
    // Pointer grab offset (thumb-centre → cursor), in normalised plane units.
    #grab = { x: 0, y: 0 };
    // Offscreen raster canvas, reused across frames; resized only when the
    // subsampled dimensions change (so a hue drag never reallocates it).
    #off = null;
    #offCtx = null;
    #offW = 0;
    #offH = 0;
    constructor(root, onChange) {
        this.#root = root;
        this.#canvas =
            root?.querySelector('.area-canvas') ?? null;
        this.#emit = onChange;
        if (!root || !this.#canvas) {
            return;
        }
        this.#bindPointer(root);
        this.#bindKeyboard(root);
        // Repaint once the canvas actually has a laid-out size, and on any later
        // resize. The first frame can otherwise rasterise against a still-unsized
        // canvas (clientWidth 0), fall back to a default width the browser then
        // downsamples into the real box, and leave the boundary stroke too thin
        // until the first interaction forces a fresh frame at the correct size.
        if (typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(() => this.#schedulePaint());
            ro.observe(this.#canvas);
            this.#abort.signal.addEventListener('abort', () => ro.disconnect());
        }
        this.#abort.signal.addEventListener('abort', () => {
            if (this.#raf !== null) {
                cancelAnimationFrame(this.#raf);
            }
        });
    }
    // ── Public API ───────────────────────────────────────────────────────────
    /** Adopt a colour from any CSS string, projected onto the OKLCH plane. */
    setValue(css) {
        const parsed = parse(css);
        this.#value = parsed
            ? convert(parsed.coords, parsed.space, 'oklch').map(finite)
            : null;
        this.#sync();
    }
    /** Stretch the plane to `gamut` (the current mode's gamut). The gradient extent
     *  and the inner boundary lines both follow from it. */
    setStretch(gamut) {
        if (gamut !== this.#stretch) {
            this.#stretch = gamut;
            this.#schedulePaint(); // the gradient stretch + boundaries change with it
        }
    }
    unmount() {
        this.#abort.abort();
    }
    // ── State plumbing ─────────────────────────────────────────────────────────
    /** The colour the UI should reflect: the drag value if dragging, else committed. */
    #active() {
        return this.#live ?? this.#value;
    }
    /** Largest chroma reachable at lightness `L` on the current canvas. */
    #chromaAt(L) {
        return this.#curve ? sampleCurve(this.#curve, L) : FALLBACK_CHROMA;
    }
    /** Push a new colour: store it, tell the binding, refresh the UI. */
    #commit(coords, dragging) {
        if (dragging) {
            this.#live = coords;
        }
        this.#emit(`oklch(${finite(coords[0])} ${finite(coords[1])} ${finite(coords[2])})`, dragging);
        this.#sync();
    }
    /** Reapply every reaction to the active colour. Cheap and idempotent. */
    #sync() {
        this.#positionThumb();
        // Pointer capture (set on pointerdown) already routes the whole drag to the
        // canvas, and `touch-action: none` blocks touch-scroll — so the drag is
        // isolated without inert-ing the page (which would blur the focused mode
        // dropdown mid-gesture and swallow the first click after a mode switch).
        this.#root?.classList.toggle('dragging', this.#live != null);
        // The gradient only depends on hue; skip the repaint within a slice.
        if ((this.#active()?.[2] ?? 0) !== this.#paintedHue) {
            this.#schedulePaint();
        }
    }
    #positionThumb() {
        const c = this.#active();
        if (!c) {
            return;
        }
        const ceiling = this.#chromaAt(c[0]);
        const x = ceiling > 0 ? Math.min(100, (c[1] / ceiling) * 100) : 0;
        this.#root?.style.setProperty('--thumb-x', `${x}%`);
        this.#root?.style.setProperty('--thumb-y', `${(1 - c[0]) * 100}%`);
    }
    // ── Pointer + keyboard ─────────────────────────────────────────────────────
    #bindPointer(root) {
        const thumb = root.querySelector('.area-thumb');
        const opts = { signal: this.#abort.signal };
        let rect = null;
        let activeId = null;
        // Map a pointer event to OKLCH coords on the plane (x → chroma, y → L).
        // `clamp01` pins it to the plane, so dragging outside lands on the edge.
        const project = (e) => {
            const base = this.#active();
            if (!base) {
                return null;
            }
            const r = rect ?? root.getBoundingClientRect();
            const fx = clamp01((e.clientX - r.left) / r.width - this.#grab.x);
            const fy = clamp01(1 - (e.clientY - r.top) / r.height - this.#grab.y);
            return [fy, fx * this.#chromaAt(fy), base[2]];
        };
        // Move/up live on the window for the duration of a drag (not just the
        // canvas), so the thumb keeps tracking — clamped to the edge — even when the
        // pointer is dragged outside the area. Guarded by the originating pointer id.
        const onMove = (e) => {
            if (e.pointerId !== activeId || !this.#live) {
                return;
            }
            e.preventDefault();
            const next = project(e);
            if (next) {
                this.#commit(next, true);
            }
        };
        const onUp = (e) => {
            if (e.pointerId !== activeId) {
                return;
            }
            activeId = null;
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            try {
                root.releasePointerCapture(e.pointerId);
            }
            catch {
                /* never captured — nothing to release */
            }
            if (this.#live) {
                // Commit the final value as a non-drag change so text inputs settle.
                this.#emit(`oklch(${finite(this.#live[0])} ${finite(this.#live[1])} ${finite(this.#live[2])})`, false);
            }
            this.#live = null;
            this.#grab = { x: 0, y: 0 };
            rect = null;
            this.#sync();
        };
        root.addEventListener('pointerdown', (e) => {
            activeId = e.pointerId;
            // Capture is a bonus (stops other elements reacting mid-drag); the
            // window listeners are what guarantee delivery once the pointer leaves.
            try {
                root.setPointerCapture(e.pointerId);
            }
            catch {
                /* ignore — window listeners cover delivery */
            }
            rect = root.getBoundingClientRect();
            const onThumb = thumb && (e.target === thumb || thumb.contains(e.target));
            if (onThumb) {
                // Grab: record cursor→thumb-centre offset so the thumb doesn't jump.
                const t = thumb.getBoundingClientRect();
                const cx = (t.left + t.width / 2 - rect.left) / rect.width;
                const cy = 1 - (t.top + t.height / 2 - rect.top) / rect.height;
                this.#grab = {
                    x: (e.clientX - rect.left) / rect.width - cx,
                    y: 1 - (e.clientY - rect.top) / rect.height - cy,
                };
                const base = this.#active();
                if (base) {
                    this.#commit([base[0], base[1], base[2]], true);
                }
            }
            else {
                // Bare click: jump to the cursor.
                this.#grab = { x: 0, y: 0 };
                const next = project(e);
                if (next) {
                    this.#commit(next, true);
                }
            }
            window.addEventListener('pointermove', onMove, opts);
            window.addEventListener('pointerup', onUp, opts);
            window.addEventListener('pointercancel', onUp, opts);
        }, opts);
    }
    #bindKeyboard(root) {
        const STEPS = {
            ArrowRight: [1, 0],
            ArrowLeft: [-1, 0],
            ArrowUp: [0, 1],
            ArrowDown: [0, -1],
        };
        root.addEventListener('keydown', (e) => {
            const step = STEPS[e.key];
            const base = this.#value;
            if (!step || !base) {
                return;
            }
            e.preventDefault();
            const [L, C, H] = base;
            const ceiling = this.#chromaAt(L);
            const nextC = Math.max(0, Math.min(ceiling, C + step[0] * (ceiling / 100)));
            const nextL = clamp01(L + step[1] / 100);
            this.#commit([nextL, nextC, H], false);
        }, { signal: this.#abort.signal });
    }
    // ── Rendering ────────────────────────────────────────────────────────────
    #schedulePaint() {
        if (this.#raf !== null) {
            return;
        }
        this.#raf = requestAnimationFrame(() => {
            this.#raf = null;
            this.#paint();
        });
    }
    #paint() {
        const canvas = this.#canvas;
        const c = this.#active();
        if (!canvas || !c) {
            return;
        }
        this.#paintedHue = c[2];
        const colorSpace = wideCanvas ? 'display-p3' : 'srgb';
        let area;
        try {
            area = computeArea({
                hue: c[2],
                cssW: canvas.clientWidth || 320,
                cssH: canvas.clientHeight || 200,
                dpr: window.devicePixelRatio || 1,
                supportsP3: wideCanvas,
                stretch: this.#stretch,
            });
        }
        catch {
            return; // never let a bad frame throw out of rAF
        }
        this.#curve = area.chromaCurve;
        // Rasterise the gradient at low res offscreen, then scale it up smoothly.
        // Reuse the offscreen canvas across frames; resizing it (which also clears
        // it) only when the subsampled dimensions change.
        if (!this.#off || this.#offW !== area.W || this.#offH !== area.H) {
            if (!this.#off) {
                this.#off = document.createElement('canvas');
            }
            this.#off.width = area.W;
            this.#off.height = area.H;
            this.#offW = area.W;
            this.#offH = area.H;
            this.#offCtx = this.#off.getContext('2d', { colorSpace });
        }
        const offCtx = this.#offCtx;
        if (!offCtx) {
            return;
        }
        // `area.pixels` is already a correctly-sized Uint8ClampedArray; wrap it as
        // ImageData (tagged with the canvas colour space so P3 bytes aren't read as
        // sRGB) and blit — no intermediate buffer allocation or copy.
        offCtx.putImageData(new ImageData(area.pixels, area.W, area.H, { colorSpace }), 0, 0);
        canvas.width = area.backingW;
        canvas.height = area.backingH;
        const ctx = canvas.getContext('2d', { colorSpace });
        if (!ctx) {
            return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(this.#off, 0, 0, area.backingW, area.backingH);
        // computeArea only returns boundary curves in wide mode, so just draw them.
        area.boundaries.forEach((b) => strokeBoundary(ctx, b));
        // Thumb x depends on the chroma curve we just built.
        this.#positionThumb();
    }
}

/*
 * The colour area — our gamut-aware `AreaPicker` wrapped as a Tweakpane
 * sub-controller. It's an OKLCH lightness×chroma plane scaled to the mode's gamut
 * (see `areaStretch`): the sRGB-bound modes draw the sRGB plane (no lines), every
 * wide mode draws the P3 plane with the solid sRGB line inside and a dashed P3
 * line at the edge. P3 is the plane's edge — the widest gamut real displays show
 * — so you can't drag into colours the screen can't render. (The thumb shifts a
 * little when switching between the sRGB and P3 planes, since the axis rescales.)
 */
const cnSv = ClassName('svp');
class AreaController {
    element;
    value_;
    mode_;
    picker_;
    // True while writing the value in response to the picker's own onChange, so
    // the value->setValue binding doesn't echo back into it.
    fromArea_ = false;
    constructor(doc, config) {
        this.value_ = config.value;
        this.mode_ = config.mode;
        const root = doc.createElement('div');
        root.classList.add(cnSv());
        config.viewProps.bindClassModifiers(root);
        config.viewProps.bindTabIndex(root); // focusable, like the native SV palette
        const canvas = doc.createElement('canvas');
        // `area-canvas` is the hook AreaPicker queries; `tp-svpv_c` (the native SV
        // canvas class) gives it the exact native crosshair cursor + size.
        canvas.classList.add('area-canvas', cnSv('c'));
        root.appendChild(canvas);
        const thumb = doc.createElement('div');
        // Reuse the native SV-marker class so the selection circle is pixel-identical.
        thumb.classList.add('area-thumb', cnSv('m'));
        root.appendChild(thumb);
        this.element = root;
        this.picker_ = new AreaPicker(root, (css, isDragging) => {
            let next;
            try {
                next = this.value_.rawValue.withCss(css);
            }
            catch {
                return;
            }
            this.fromArea_ = true;
            this.value_.rawValue = next;
            this.fromArea_ = false;
            if (!isDragging) {
                this.sync_();
            }
        });
        bindValue(this.value_, () => {
            if (this.fromArea_) {
                return;
            }
            this.sync_();
        });
        // The plane's gamut tracks the mode (sRGB / P3 / Rec2020); narrower gamuts
        // are then drawn as inner boundary lines.
        const syncGamut = () => this.picker_.setStretch(areaStretch(this.mode_.rawValue));
        syncGamut();
        this.mode_.emitter.on('change', syncGamut);
        config.viewProps.handleDispose(() => {
            this.picker_.unmount();
        });
    }
    sync_() {
        this.picker_.setValue(this.value_.rawValue.displayCss());
    }
    /** Re-render once the popup is visible (the canvas needs a real layout size). */
    refresh() {
        this.sync_();
    }
}

/*
 * Hue / alpha strips, reusing Tweakpane's native h-palette (`tp-hplv`) and
 * a-palette (`tp-aplv`) DOM + classes so the loaded Tweakpane CSS styles them
 * identically to the built-in picker. The hue strip edits the fixed axis of the
 * current mode's area plane (oklch H / okhsv h / hsl H); the alpha strip edits
 * alpha.
 */
const cnHpl = ClassName('hpl');
const cnApl = ClassName('apl');
class StripController {
    element;
    kind_;
    value_;
    mode_;
    markerElem_;
    fillElem_;
    constructor(doc, config) {
        this.kind_ = config.kind;
        this.value_ = config.value;
        this.mode_ = config.mode;
        this.onPoint_ = this.onPoint_.bind(this);
        this.refresh_ = this.refresh_.bind(this);
        const cn = config.kind === 'hue' ? cnHpl : cnApl;
        const root = doc.createElement('div');
        root.classList.add(cn());
        config.viewProps.bindClassModifiers(root);
        config.viewProps.bindTabIndex(root);
        if (config.kind === 'hue') {
            const bar = doc.createElement('div');
            bar.classList.add(cn('c')); // rainbow gradient comes from native CSS
            root.appendChild(bar);
            this.fillElem_ = bar;
            const marker = doc.createElement('div');
            marker.classList.add(cn('m'));
            root.appendChild(marker);
            this.markerElem_ = marker;
        }
        else {
            const bar = doc.createElement('div');
            bar.classList.add(cn('b'));
            root.appendChild(bar);
            const fill = doc.createElement('div');
            fill.classList.add(cn('c'));
            bar.appendChild(fill);
            this.fillElem_ = fill;
            const marker = doc.createElement('div');
            marker.classList.add(cn('m'));
            root.appendChild(marker);
            const preview = doc.createElement('div');
            preview.classList.add(cn('p'));
            marker.appendChild(preview);
            this.markerElem_ = marker;
        }
        this.element = root;
        const ph = new PointerHandler(root);
        ph.emitter.on('down', this.onPoint_);
        ph.emitter.on('move', this.onPoint_);
        ph.emitter.on('up', this.onPoint_);
        this.value_.emitter.on('change', this.refresh_);
        this.mode_.emitter.on('change', this.refresh_);
        this.refresh_();
    }
    onPoint_(ev) {
        const point = ev.data.point;
        if (!point) {
            return;
        }
        const t = Math.max(0, Math.min(1, point.x / ev.data.bounds.width));
        const c = this.value_.rawValue;
        // The area is locked to the OKLCH plane, so the hue strip edits OKLCH hue.
        this.value_.rawValue =
            this.kind_ === 'hue' ? c.withAreaHue(t * 360) : c.withAlpha(t);
    }
    refresh_() {
        const c = this.value_.rawValue;
        if (this.kind_ === 'hue') {
            const h = c.areaHue();
            this.markerElem_.style.left = `${(h / 360) * 100}%`;
            // Like native: fill the marker with the pure hue at its position, so it
            // blends into the rainbow (its white ring makes it visible) instead of
            // showing the muted current colour.
            this.markerElem_.style.backgroundColor = `hsl(${h} 100% 50%)`;
        }
        else {
            const [l, ch, hh] = c.coordsIn('oklch').coords;
            this.fillElem_.style.background = `linear-gradient(to right, oklch(${l} ${ch} ${hh} / 0), oklch(${l} ${ch} ${hh} / 1))`;
            this.markerElem_.style.left = `${c.alpha * 100}%`;
            this.markerElem_.style.backgroundColor = c.displayCss();
        }
    }
}

/*
 * The texts row, reusing Tweakpane's native `tp-coltxtv` DOM + classes (mode
 * <select> + dropdown chevron + per-channel inputs) so it's styled identically
 * to the built-in picker. Channel inputs reuse core's `NumberTextController`;
 * hex mode uses a single `TextController`.
 *
 * All value<->input syncing is gated by `syncing_` so programmatic updates never
 * feed back as user edits (otherwise rebuilds oscillate the shared value).
 */
const cn$1 = ClassName('coltxt');
class TextsController {
    element;
    doc_;
    value_;
    mode_;
    viewProps_;
    selectElem_;
    inputsElem_;
    gamutElem_;
    numberCs_ = [];
    hexC_ = null;
    syncing_ = false;
    measureCtx_ = null;
    constructor(doc, config) {
        this.doc_ = doc;
        this.value_ = config.value;
        this.mode_ = config.mode;
        this.viewProps_ = config.viewProps;
        this.onSelectChange_ = this.onSelectChange_.bind(this);
        this.onModeChange_ = this.onModeChange_.bind(this);
        this.onColorChange_ = this.onColorChange_.bind(this);
        const root = doc.createElement('div');
        root.classList.add(cn$1(), 'wgc-coltxt');
        config.viewProps.bindClassModifiers(root);
        // Header line: mode <select> + chevron (native markup) on the left, the
        // smallest-containing-gamut readout on the right. Giving the dropdown its
        // own line frees a full row for the channel numbers below.
        const head = doc.createElement('div');
        head.classList.add('wgc-coltxt_head');
        const modeWrap = doc.createElement('div');
        modeWrap.classList.add(cn$1('m'));
        const select = doc.createElement('select');
        select.classList.add(cn$1('ms'));
        config.viewProps.bindDisabled(select);
        EDIT_MODES.forEach((m) => {
            const opt = doc.createElement('option');
            opt.textContent = MODE_LABELS[m];
            opt.value = m;
            select.appendChild(opt);
        });
        select.value = this.mode_.rawValue;
        select.addEventListener('change', this.onSelectChange_);
        modeWrap.appendChild(select);
        const marker = doc.createElement('div');
        marker.classList.add(cn$1('mm'));
        marker.innerHTML = '<svg><path d="M5 7h6l-3 3 z"></path></svg>';
        modeWrap.appendChild(marker);
        head.appendChild(modeWrap);
        this.selectElem_ = select;
        const gamut = doc.createElement('div');
        gamut.classList.add('wgc-gamut');
        head.appendChild(gamut);
        this.gamutElem_ = gamut;
        root.appendChild(head);
        const inputs = doc.createElement('div');
        inputs.classList.add(cn$1('w'));
        root.appendChild(inputs);
        this.inputsElem_ = inputs;
        this.element = root;
        this.buildInputs_();
        this.refreshGamut_();
        this.value_.emitter.on('change', this.onColorChange_);
        this.mode_.emitter.on('change', this.onModeChange_);
        // Size the select once it's in the DOM (a microtask fires right after the
        // blade is mounted, and — unlike rAF — even in a background tab).
        queueMicrotask(() => this.sizeSelect_());
    }
    /** Re-measure the mode select; call when the picker becomes visible (the
     *  select can only be measured once it's in the DOM + styled). */
    refreshLayout() {
        this.sizeSelect_();
    }
    onSelectChange_() {
        const mode = this.selectElem_.value;
        this.mode_.rawValue = mode;
        // Re-format the bound value (and thus the collapsed readout) into the chosen
        // mode; the canonical OKLCH coords are untouched, so nothing is lost.
        this.value_.rawValue = this.value_.rawValue.withFormat(mode);
    }
    onModeChange_() {
        if (this.selectElem_.value !== this.mode_.rawValue) {
            this.selectElem_.value = this.mode_.rawValue;
        }
        this.sizeSelect_();
        this.buildInputs_();
    }
    /**
     * Size the mode <select> to its current label so the chevron stays beside the
     * text. Our OKLCH label is wider than native's 3-char options, so a fixed
     * (widest-option) width would leave a gap for shorter labels like RGB.
     */
    sizeSelect_() {
        const opt = this.selectElem_.options[this.selectElem_.selectedIndex];
        if (!opt) {
            return;
        }
        if (!this.measureCtx_) {
            this.measureCtx_ = this.doc_.createElement('canvas').getContext('2d');
        }
        const ctx = this.measureCtx_;
        if (!ctx) {
            return;
        }
        const cs = getComputedStyle(this.selectElem_);
        ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const w = ctx.measureText(opt.text).width;
        // label width + native's horizontal padding (4px left + 18px right chevron)
        this.selectElem_.style.width = `${Math.ceil(w) + 22}px`;
    }
    onColorChange_() {
        this.refreshGamut_();
        if (this.syncing_) {
            return;
        }
        this.refreshInputs_();
    }
    /** Update the gamut readout (the smallest gamut containing the colour). */
    refreshGamut_() {
        this.gamutElem_.textContent = this.value_.rawValue.gamutLabel();
    }
    /** Wrap an input in a `tp-coltxtv_c` cell, like native (provides the spacing). */
    appendInput_(el) {
        const cell = this.doc_.createElement('div');
        cell.classList.add(cn$1('c'));
        cell.appendChild(el);
        this.inputsElem_.appendChild(cell);
    }
    buildInputs_() {
        this.syncing_ = true;
        try {
            const doc = this.doc_;
            const mode = this.mode_.rawValue;
            this.numberCs_ = [];
            this.hexC_ = null;
            this.inputsElem_.textContent = '';
            if (mode === 'hex') {
                const tc = new TextController(doc, {
                    parser: (t) => t,
                    props: ValueMap.fromObject({ formatter: (v) => v }),
                    value: createValue(this.value_.rawValue.gamutCss()),
                    viewProps: this.viewProps_,
                });
                tc.value.emitter.on('change', () => {
                    if (this.syncing_) {
                        return;
                    }
                    const parsed = OklchColor.tryFromString(tc.value.rawValue);
                    if (parsed) {
                        this.value_.rawValue = parsed;
                    }
                });
                this.appendInput_(tc.view.element);
                this.hexC_ = tc;
                return;
            }
            const channels = MODE_CHANNELS[mode];
            const vals = this.value_.rawValue.channelValues(mode);
            this.numberCs_ = channels.map((ch, i) => {
                // Clamp to the channel's range (e.g. RGB stops at 255) on both drag
                // and typed entry. OKLCH chroma's cap is generous (0.5, past every
                // real gamut) so wide-gamut colours still fit.
                const cr = createRangeConstraint({ min: ch.min, max: ch.max });
                const nc = new NumberTextController(doc, {
                    parser: parseNumber,
                    props: ValueMap.fromObject({
                        formatter: createNumberFormatter(digitsFor(ch.step)),
                        keyScale: ch.step,
                        pointerScale: ch.step,
                    }),
                    value: createValue(vals[i], cr ? { constraint: cr } : undefined),
                    viewProps: this.viewProps_,
                    arrayPosition: i === 0 ? 'fst' : i === channels.length - 1 ? 'lst' : 'mid',
                });
                nc.value.emitter.on('change', () => {
                    if (this.syncing_) {
                        return;
                    }
                    this.value_.rawValue = this.value_.rawValue.withChannel(mode, i, nc.value.rawValue);
                });
                this.appendInput_(nc.view.element);
                return nc;
            });
        }
        finally {
            this.syncing_ = false;
        }
    }
    refreshInputs_() {
        this.syncing_ = true;
        try {
            const mode = this.mode_.rawValue;
            if (mode === 'hex') {
                if (this.hexC_) {
                    this.hexC_.value.rawValue = this.value_.rawValue.gamutCss();
                }
            }
            else {
                const vals = this.value_.rawValue.channelValues(mode);
                this.numberCs_.forEach((nc, i) => {
                    nc.value.rawValue = vals[i];
                });
            }
        }
        finally {
            this.syncing_ = false;
        }
    }
}

/*
 * The picker body, reusing Tweakpane's native `tp-colpv` layout: an `_hsv` block
 * (colour area + hue strip), the `_rgb` texts row, and — when the value has alpha
 * — an `_a` row holding the alpha strip (`_ap`) + an alpha number input (`_at`).
 * The mode value is owned here and shared with the area, hue strip and texts row.
 */
const cn = ClassName('colp');
class PickerController {
    element;
    mode;
    area_;
    texts_;
    constructor(doc, config) {
        // Start in the value's own mode, so the dropdown + collapsed readout agree.
        this.mode = createValue(config.value.rawValue.mode);
        const shared = {
            value: config.value,
            mode: this.mode,
            viewProps: config.viewProps,
        };
        const root = doc.createElement('div');
        root.classList.add(cn());
        config.viewProps.bindClassModifiers(root);
        // HSV block: colour area + hue strip.
        const hsv = doc.createElement('div');
        hsv.classList.add(cn('hsv'));
        root.appendChild(hsv);
        const svWrap = doc.createElement('div');
        svWrap.classList.add(cn('sv'));
        this.area_ = new AreaController(doc, shared);
        svWrap.appendChild(this.area_.element);
        hsv.appendChild(svWrap);
        const hWrap = doc.createElement('div');
        hWrap.classList.add(cn('h'));
        const hue = new StripController(doc, { kind: 'hue', ...shared });
        hWrap.appendChild(hue.element);
        hsv.appendChild(hWrap);
        // Texts row (mode dropdown + channel inputs).
        const rgb = doc.createElement('div');
        rgb.classList.add(cn('rgb'));
        this.texts_ = new TextsController(doc, shared);
        rgb.appendChild(this.texts_.element);
        root.appendChild(rgb);
        // Alpha row — only when the bound value carries alpha (matches native).
        if (config.value.rawValue.hasAlpha) {
            root.appendChild(this.createAlphaRow_(doc, config.value, shared));
        }
        // Follow the value's output format: typing a different-format colour into
        // the text field (e.g. a hex while in OKLCH mode) re-points the mode
        // dropdown, so it never disagrees with the collapsed readout.
        config.value.emitter.on('change', () => {
            const mode = config.value.rawValue.mode;
            if (mode !== this.mode.rawValue) {
                this.mode.rawValue = mode;
            }
        });
        this.element = root;
    }
    createAlphaRow_(doc, value, shared) {
        const row = doc.createElement('div');
        row.classList.add(cn('a'));
        const apWrap = doc.createElement('div');
        apWrap.classList.add(cn('ap'));
        const strip = new StripController(doc, { kind: 'alpha', ...shared });
        apWrap.appendChild(strip.element);
        row.appendChild(apWrap);
        const atWrap = doc.createElement('div');
        atWrap.classList.add(cn('at'));
        const aCr = createRangeConstraint({ min: 0, max: 1 });
        const num = new NumberTextController(doc, {
            parser: parseNumber,
            props: ValueMap.fromObject({
                formatter: createNumberFormatter(2),
                keyScale: 0.1,
                pointerScale: 0.01,
            }),
            value: createValue(value.rawValue.alpha, aCr ? { constraint: aCr } : undefined),
            viewProps: shared.viewProps,
        });
        let syncing = false;
        num.value.emitter.on('change', () => {
            if (syncing) {
                return;
            }
            const a = Math.max(0, Math.min(1, num.value.rawValue));
            value.rawValue = value.rawValue.withAlpha(a);
        });
        value.emitter.on('change', () => {
            syncing = true;
            num.value.rawValue = value.rawValue.alpha;
            syncing = false;
        });
        atWrap.appendChild(num.view.element);
        row.appendChild(atWrap);
        return row;
    }
    /** Re-render the area + size the mode select after the popup opens (both need
     *  a real, visible layout). */
    refresh() {
        this.area_.refresh();
        this.texts_.refreshLayout();
    }
    /** Move focus into the picker so focus-out can later auto-close it. */
    focus() {
        this.area_.element.focus();
    }
}

/*
 * Top-level colour view, reusing Tweakpane's native `tp-colv` layout (header with
 * swatch + colour text field, plus the popup container) so sizing, padding and
 * margins match the built-in picker exactly.
 */
const cnCol = ClassName('col');
const cnSw = ClassName('colsw');
class ColorView {
    element;
    swatchButtonElement;
    swatchBoxElement;
    textElement;
    constructor(doc, config) {
        const root = doc.createElement('div');
        root.classList.add(cnCol(), cnCol(undefined, 'cpl'));
        config.viewProps.bindClassModifiers(root);
        config.foldable.bindExpandedClass(root, cnCol(undefined, 'expanded'));
        const head = doc.createElement('div');
        head.classList.add(cnCol('h'));
        root.appendChild(head);
        const swatchWrap = doc.createElement('div');
        swatchWrap.classList.add(cnCol('s'));
        head.appendChild(swatchWrap);
        const swatch = doc.createElement('div');
        swatch.classList.add(cnSw());
        config.viewProps.bindClassModifiers(swatch);
        swatchWrap.appendChild(swatch);
        const box = doc.createElement('div');
        box.classList.add(cnSw('sw'));
        swatch.appendChild(box);
        this.swatchBoxElement = box;
        const button = doc.createElement('button');
        button.classList.add(cnSw('b'));
        config.viewProps.bindDisabled(button);
        swatch.appendChild(button);
        this.swatchButtonElement = button;
        const text = doc.createElement('div');
        text.classList.add(cnCol('t'));
        head.appendChild(text);
        this.textElement = text;
        this.element = root;
    }
}

/*
 * Top-level colour controller — composes the swatch button, the colour text
 * field, and the popup picker over a single bound `OklchColor` value. Mirrors
 * Tweakpane's native `ColorController` (popup layout).
 */
class ColorController {
    value;
    view;
    viewProps;
    foldable_;
    picker_;
    constructor(doc, config) {
        this.value = config.value;
        this.viewProps = config.viewProps;
        this.onButtonClick_ = this.onButtonClick_.bind(this);
        this.onValueChange_ = this.onValueChange_.bind(this);
        this.onDocPointerDown_ = this.onDocPointerDown_.bind(this);
        this.onKeydown_ = this.onKeydown_.bind(this);
        this.foldable_ = Foldable.create(config.expanded ?? false);
        this.view = new ColorView(doc, {
            viewProps: this.viewProps,
            foldable: this.foldable_,
        });
        this.view.swatchButtonElement.addEventListener('click', this.onButtonClick_);
        // Close on a pointer-down outside this colour view. Deliberately focus-
        // INDEPENDENT, so it's robust in Safari — which doesn't move focus to a
        // clicked button / tabindex element and doesn't reliably set a focus
        // relatedTarget (the gap @tweakpane/core's own `findNextTarget` leaves as a
        // "TODO: Workaround for Safari", where a focus-based close mis-fires). It also
        // gives "one open at a time": a pointer-down on another swatch is outside this
        // view, so this popup closes.
        doc.addEventListener('pointerdown', this.onDocPointerDown_, true);
        this.view.element.addEventListener('keydown', this.onKeydown_);
        this.viewProps.handleDispose(() => {
            doc.removeEventListener('pointerdown', this.onDocPointerDown_, true);
        });
        // Colour text field, two-way bound directly to the colour value. The header
        // is tight, so we show just the channel numbers — no `oklch(`…`)` wrapper
        // and no `display-p3`/`rec2020` name (the mode dropdown already says it);
        // hex stays as `#…`. Editing accepts a full colour string, or bare numbers
        // re-wrapped into the current mode's form via `wrapReadout`.
        const textC = new TextController(doc, {
            parser: (text) => {
                const t = text.trim();
                // `.asEdited()` drops the verbatim source so the result re-serialises
                // from its clamped coords — an out-of-range entry (e.g. a chroma of
                // 40000) shows as the clamped value instead of echoing the nonsense.
                const direct = OklchColor.tryFromString(t);
                if (direct) {
                    return direct.asEdited();
                }
                const wrapped = OklchColor.tryFromString(this.value.rawValue.wrapReadout(t));
                return wrapped ? wrapped.asEdited() : null;
            },
            props: ValueMap.fromObject({
                formatter: (c) => c.readoutString(),
            }),
            value: this.value,
            viewProps: this.viewProps,
        });
        this.view.textElement.appendChild(textC.view.element);
        this.picker_ = new PickerController(doc, {
            value: this.value,
            viewProps: this.viewProps,
        });
        const popC = new PopupController(doc, { viewProps: this.viewProps });
        this.view.element.appendChild(popC.view.element);
        popC.view.element.appendChild(this.picker_.element);
        connectValues({
            primary: this.foldable_.value('expanded'),
            secondary: popC.shows,
            forward: (p) => p,
            backward: (_, s) => s,
        });
        this.value.emitter.on('change', this.onValueChange_);
        this.refreshSwatch_();
        // On open: re-render the area (the canvas needs a real size) and move focus
        // into the picker for keyboard navigation.
        this.foldable_.value('expanded').emitter.on('change', () => {
            if (this.foldable_.get('expanded')) {
                requestAnimationFrame(() => {
                    this.picker_.refresh();
                    this.picker_.focus();
                });
            }
        });
    }
    onDocPointerDown_(e) {
        if (!this.foldable_.get('expanded')) {
            return;
        }
        const target = e.target;
        if (!target || !this.view.element.contains(target)) {
            this.foldable_.set('expanded', false);
        }
    }
    onKeydown_(e) {
        if (e.key === 'Escape' && this.foldable_.get('expanded')) {
            this.foldable_.set('expanded', false);
            this.view.swatchButtonElement.focus();
        }
    }
    refreshSwatch_() {
        this.view.swatchBoxElement.style.backgroundColor =
            this.value.rawValue.displayCss();
    }
    onValueChange_() {
        this.refreshSwatch_();
    }
    onButtonClick_() {
        this.foldable_.set('expanded', !this.foldable_.get('expanded'));
    }
}

/**
 * Drop-in OKLCH colour picker. Because Tweakpane tries registered plugins before
 * its built-ins, this claims any colour-string binding and replaces the native
 * picker — no `view` parameter required.
 */
const OklchInputPlugin = createPlugin({
    id: 'input-wide-gamut',
    type: 'input',
    accept(exValue, params) {
        if (!OklchColor.isColorString(exValue)) {
            return null;
        }
        const result = parseRecord(params, (p) => ({
            expanded: p.optional.boolean,
        }));
        if (!result) {
            return null;
        }
        return {
            initialValue: exValue,
            params: result,
        };
    },
    binding: {
        reader: (_args) => (exValue) => OklchColor.fromString(String(exValue)),
        equals: (a, b) => a.equals(b),
        writer: (_args) => (target, inValue) => {
            target.write(inValue.serialize());
        },
    },
    controller(args) {
        return new ColorController(args.document, {
            value: args.value,
            viewProps: args.viewProps,
            expanded: args.params.expanded,
        });
    },
});

// Tweakpane plugin-bundle exports. `.area-canvas{touch-action:none}.area-thumb{left:var(--thumb-x, 50%);pointer-events:none;top:var(--thumb-y, 50%)}.tp-coltxtv.wgc-coltxt{display:flex;flex-direction:column;gap:2px}.wgc-coltxt_head{align-items:center;display:flex;justify-content:space-between}.wgc-gamut{color:var(--lbl-fg);padding-right:4px;white-space:nowrap}` is replaced with the compiled SCSS
// at build time by @rollup/plugin-replace (see rollup.config.js).
const id = 'wide-gamut';
const css = '.area-canvas{touch-action:none}.area-thumb{left:var(--thumb-x, 50%);pointer-events:none;top:var(--thumb-y, 50%)}.tp-coltxtv.wgc-coltxt{display:flex;flex-direction:column;gap:2px}.wgc-coltxt_head{align-items:center;display:flex;justify-content:space-between}.wgc-gamut{color:var(--lbl-fg);padding-right:4px;white-space:nowrap}';
const plugins = [OklchInputPlugin];

export { css, id, plugins };
