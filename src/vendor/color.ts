/*
 * Registers the colorjs.io colour spaces the picker parses and converts between
 * (sRGB, OKLCH, OKLab, LCH, Lab, HSL, HWB, P3, Rec2020, ProPhoto, A98, XYZ).
 * Imported for its side-effect by the model and the area-compute module.
 * Space list adapted from Adam Argyle's color-input (MIT).
 */
import * as colorjs from 'colorjs.io/fn';

colorjs.ColorSpace.register(colorjs.sRGB);
colorjs.ColorSpace.register(colorjs.sRGB_Linear);
colorjs.ColorSpace.register(colorjs.HSL);
colorjs.ColorSpace.register(colorjs.HWB);
colorjs.ColorSpace.register(colorjs.Lab);
colorjs.ColorSpace.register(colorjs.LCH);
colorjs.ColorSpace.register(colorjs.OKLab);
colorjs.ColorSpace.register(colorjs.OKLCH);
colorjs.ColorSpace.register(colorjs.P3);
colorjs.ColorSpace.register(colorjs.A98RGB);
colorjs.ColorSpace.register(colorjs.ProPhoto);
colorjs.ColorSpace.register(colorjs.REC_2020);
colorjs.ColorSpace.register(colorjs.XYZ_D65);
colorjs.ColorSpace.register(colorjs.XYZ_D50);
