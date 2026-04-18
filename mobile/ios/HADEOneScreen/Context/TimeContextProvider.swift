import Foundation

protocol TimeContextProviding {
    func current() -> TimeContext
}

struct TimeContextProvider: TimeContextProviding {
    func current() -> TimeContext {
        let now = Date()
        let calendar = Calendar.current
        let hour = calendar.component(.hour, from: now)
        let weekday = calendar.component(.weekday, from: now)

        let dayPart: TimeContext.DayPart
        switch hour {
        case 5..<11: dayPart = .morning
        case 11..<13: dayPart = .midday
        case 13..<17: dayPart = .afternoon
        case 17..<19: dayPart = .earlyEvening
        case 19..<22: dayPart = .evening
        default: dayPart = .lateNight
        }

        let dayType: TimeContext.DayType
        if (weekday == 6 || weekday == 7) && hour >= 18 {
            dayType = .weekendPrime
        } else if weekday == 1 || weekday == 7 {
            dayType = .weekend
        } else if hour >= 18 {
            dayType = .weekdayEvening
        } else {
            dayType = .weekday
        }

        return TimeContext(dayPart: dayPart, dayType: dayType)
    }
}
