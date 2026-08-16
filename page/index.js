import { createWidget, widget, align } from '@zos/ui'

Page({
  build() {
    createWidget(widget.TEXT, {
      x: 0,
      y: 190,
      w: 480,
      h: 100,
      text: 'Hello World',
      text_size: 42,
      color: 0xffffff,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
    })
  },
})