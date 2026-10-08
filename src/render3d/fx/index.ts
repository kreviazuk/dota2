/**
 * 副作用导入：所有英雄模型（models/<id>.ts）和特效（fx/<id>.ts）在模块加载时注册自己。
 * renderer3d 只导入这一个文件；每个英雄任务在这里加两行 import。
 */
import './common';
import '../models/axe';
import '../models/sven';
import './sven';
import '../models/lina';
import './lina';
import '../models/crystal_maiden';
import './crystal_maiden';
import '../models/zeus';
import './zeus';
import '../models/drow_ranger';
import './drow_ranger';
import '../models/phantom_assassin';
import './phantom_assassin';
import '../models/juggernaut';
import './juggernaut';
import '../models/pudge';
import './pudge';
