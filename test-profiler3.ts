declare const window: any;
export function test() {
  if (typeof window !== 'undefined' && window.ng && window.ng.ɵsetProfiler) {
    window.ng.ɵsetProfiler((event: number, instance: any) => {
      console.log(event, instance);
    });
  }
}
