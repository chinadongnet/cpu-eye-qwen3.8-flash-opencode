// CPU Eye - 默认示例（每个都带验证期望值）
(function (g) {
  "use strict";
  const S = [
    {
      id: "class_a", title: "class 对象成员读写（必备样例）",
      desc: "class A {int x,y} + 成员赋值；验证 a.x=1、a.y=2",
      src: `#include <iostream>
using namespace std;

class A {
public:
    int x;
    int y;
};

int main()
{
    A a;
    a.x = 1;
    a.y = 2;
    return 0;
}`,
      expect: { output: "", exit: 0, vars: { "a.x": 1, "a.y": 2 } },
    },
    {
      id: "sum_loop", title: "for 循环 1+2+...+100",
      desc: "循环 / += / ++ / 比较跳转；期望 5050",
      src: `int main()
{
    int sum = 0;
    for (int i = 1; i <= 100; i++) {
        sum += i;
    }
    cout << "sum=" << sum;
    return sum;
}`,
      expect: { output: "sum=5050", exit: 5050 },
    },
    {
      id: "fact_rec", title: "递归函数 5!",
      desc: "call/ret 与栈帧；期望 120",
      src: `int fact(int n)
{
    if (n <= 1) return 1;
    int t = fact(n - 1);
    return n * t;
}

int main()
{
    int r = fact(5);
    cout << "5! = " << r;
    return r;
}`,
      expect: { output: "5! = 120", exit: 120 },
    },
    {
      id: "swap_objs", title: "两个对象交换 x",
      desc: "多对象成员访问 + 临时变量；验证 a=(3,2) b=(1,4)",
      src: `class Point {
public:
    int x;
    int y;
};

int main()
{
    Point a;
    Point b;
    a.x = 1;
    a.y = 2;
    b.x = 3;
    b.y = 4;

    int tx = a.x;
    a.x = b.x;
    b.x = tx;

    cout << "a=(" << a.x << "," << a.y << ")";
    cout << " b=(" << b.x << "," << b.y << ")";
    return a.y + b.y;
}`,
      expect: { output: "a=(3,2) b=(1,4)", exit: 6, vars: { "a.x": 3, "a.y": 2, "b.x": 1, "b.y": 4 } },
    },
    {
      id: "gcd_while", title: "while 辗转相除 gcd(48,18)",
      desc: "while / % 取余 / 参数寄存器；期望 6",
      src: `int gcd(int a, int b)
{
    while (b != 0) {
        int t = a % b;
        a = b;
        b = t;
    }
    return a;
}

int main()
{
    int g = gcd(48, 18);
    cout << "gcd(48,18) = " << g;
    return g;
}`,
      expect: { output: "gcd(48,18) = 6", exit: 6 },
    },
    {
      id: "fib_loop", title: "迭代斐波那契 fib(10)",
      desc: "多重循环状态更新；期望 55",
      src: `int main()
{
    int a = 1, b = 1;
    for (int i = 2; i <= 9; i++) {
        int c = a + b;
        a = b;
        b = c;
    }
    cout << "fib(10) = " << b;
    return b;
}`,
      expect: { output: "fib(10) = 55", exit: 55 },
    },
  ];
  g.CE = g.CE || {}; g.CE.SAMPLES = S;
})(typeof globalThis !== "undefined" ? globalThis : window);
